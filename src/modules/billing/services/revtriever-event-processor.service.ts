import { Injectable } from '@nestjs/common';
import { AsCompany } from '../../../core/context/as-company.decorator';
import { DateUtil } from '../../../shared/utils/date.util';
import { PlanContractService } from '../../plans/services/plan-contract.service';
import { BillingEngineRejectedError } from '../domain/billing-engine.errors';
import { EngineInvoice, PaymentMethod } from '../domain/billing-engine.types';
import { BillingInvoiceDomain } from '../domain/billing-invoice.domain';
import { addMonthsUtc } from '../domain/billing-invoice.rules';
import { BillingSubscriptionDomain } from '../domain/billing-subscription.domain';
import {
    BillingInvoice,
    BillingSubscription,
    CHARGE_FAILED_LOOKBACK_DAYS,
    EVENT_STATUSES,
    EVENT_TYPES,
    EventRowStatus,
    INVOICE_STATUSES,
    InvoiceMirror,
    InvoiceRowStatus,
    NOTIFICATION_KINDS,
    RevtrieverEvent,
    SUBSCRIPTION_STATUSES
} from '../domain/billing.types';
import { RevtrieverEventDomain } from '../domain/revtriever-event.domain';
import { BillingEnginePort } from '../ports/billing-engine.port';
import { BillingLogService } from './billing-log.service';
import { BillingMailerService } from './billing-mailer.service';
import { BillingStandingService } from './billing-standing.service';
import { AppliedEvent, appliedEventOf, customerRefOf, dateOf } from './revtriever-event-applied';
import { eventTypeLabel } from './revtriever-event-ingest.service';

export interface ProcessOutcome {
    readonly status: EventRowStatus;
    readonly error: string | null;
}

const INVOICE_TYPE_STATUS: Readonly<Record<string, InvoiceRowStatus>> = {
    [EVENT_TYPES.invoiceIssued]: INVOICE_STATUSES.issued,
    [EVENT_TYPES.invoiceOverdue]: INVOICE_STATUSES.overdue,
    [EVENT_TYPES.invoicePaid]: INVOICE_STATUSES.paid
};

function methodOf(value: string | null | undefined): PaymentMethod | null {
    return value === 'card' || value === 'pix' ? value : null;
}

function cycleStartOf(event: AppliedEvent, dueDate: Date | null, remote: EngineInvoice | null): Date {
    return dateOf(event.data.cycleDate) ?? dueDate ?? dateOf(remote?.issuedAt) ?? event.occurredAt;
}

function totalOf(event: AppliedEvent, remote: EngineInvoice | null): number | null {
    return event.data.totalCents ?? remote?.totalCents ?? null;
}

function issuedAtOf(status: InvoiceRowStatus, event: AppliedEvent, remote: EngineInvoice | null): Date | null {
    return dateOf(remote?.issuedAt) ?? (status === INVOICE_STATUSES.issued ? event.occurredAt : null);
}

function paidAtOf(status: InvoiceRowStatus, event: AppliedEvent, remote: EngineInvoice | null): Date | null {
    if (status !== INVOICE_STATUSES.paid) {
        return null;
    }
    return dateOf(event.data.paidAt) ?? dateOf(remote?.paidAt) ?? event.occurredAt;
}

@Injectable()
export class RevtrieverEventProcessor {
    public constructor(
        private readonly engine: BillingEnginePort,
        private readonly subscriptions: BillingSubscriptionDomain,
        private readonly invoices: BillingInvoiceDomain,
        private readonly events: RevtrieverEventDomain,
        private readonly contracts: PlanContractService,
        private readonly mailer: BillingMailerService,
        private readonly standing: BillingStandingService,
        private readonly logs: BillingLogService
    ) {}

    public async process(row: RevtrieverEvent): Promise<ProcessOutcome> {
        const event: AppliedEvent | null = appliedEventOf(row);
        const engineSubscriptionId: string | undefined = event?.data.subscriptionId;
        if (event === null || engineSubscriptionId === undefined) {
            return { status: EVENT_STATUSES.processed, error: null };
        }
        const subscription: BillingSubscription | null = await this.subscriptions.findByEngineSubscriptionIdAcrossTenants(
            this.engine.engine,
            engineSubscriptionId
        );
        if (subscription === null) {
            return { status: EVENT_STATUSES.ignored, error: null };
        }
        const ref: string | null = customerRefOf(event.data);
        if (ref !== null && ref !== subscription.companyId) {
            this.logs.eventFailed(eventTypeLabel(row.type), row.externalEventId, 'customer_mismatch');
            return { status: EVENT_STATUSES.failed, error: 'customer_mismatch' };
        }
        await this.apply(subscription.companyId, subscription, event);
        return { status: EVENT_STATUSES.processed, error: null };
    }

    @AsCompany()
    private async apply(_companyId: string, subscription: BillingSubscription, event: AppliedEvent): Promise<void> {
        const status: InvoiceRowStatus | undefined = INVOICE_TYPE_STATUS[event.type];
        if (status !== undefined) {
            await this.applyInvoice(subscription, event, status);
        }
        await this.applyOther(subscription, event);
        await this.standing.recompute(new Date());
    }

    private async applyOther(subscription: BillingSubscription, event: AppliedEvent): Promise<void> {
        if (event.type === EVENT_TYPES.chargeFailed) {
            await this.applyChargeFailed(event);
        }
        if (event.type === EVENT_TYPES.subscriptionCanceled) {
            await this.applyCanceled(subscription, event);
        }
        if (event.type === EVENT_TYPES.subscriptionCardSaved) {
            await this.applyCardSaved(subscription, event);
        }
        if (event.type === EVENT_TYPES.invoiceHeld || event.type === EVENT_TYPES.pricingFailing) {
            this.logs.eventFailed(event.type, event.eventId, 'engine_reported');
        }
    }

    private async applyInvoice(subscription: BillingSubscription, event: AppliedEvent, status: InvoiceRowStatus): Promise<void> {
        const engineInvoiceId: string | undefined = event.data.invoiceId;
        if (engineInvoiceId === undefined) {
            return;
        }
        const remote: EngineInvoice | null = await this.remoteInvoice(engineInvoiceId);
        const stored: BillingInvoice = await this.invoices.mirror(
            this.engine.engine,
            subscription.id,
            this.mirrorOf(engineInvoiceId, status, event, remote)
        );
        if (status === INVOICE_STATUSES.issued) {
            await this.reapplyChargeFailed(subscription, stored);
        }
        if (stored.status === INVOICE_STATUSES.paid) {
            await this.onPaid(subscription, stored, event.occurredAt);
        }
    }

    private async remoteInvoice(id: string): Promise<EngineInvoice | null> {
        try {
            return await this.engine.invoiceOf(id);
        } catch (error: unknown) {
            if (error instanceof BillingEngineRejectedError) {
                return null;
            }
            throw error;
        }
    }

    private mirrorOf(engineInvoiceId: string, status: InvoiceRowStatus, event: AppliedEvent, remote: EngineInvoice | null): InvoiceMirror {
        const dueDate: Date | null = dateOf(event.data.dueDate) ?? dateOf(remote?.dueDate);
        const cycleStart: Date = cycleStartOf(event, dueDate, remote);
        return {
            engineInvoiceId,
            status,
            totalCents: totalOf(event, remote),
            method: methodOf(event.data.method) ?? remote?.method ?? null,
            dueDate,
            cycleStart,
            cycleEnd: addMonthsUtc(cycleStart, 1),
            issuedAt: issuedAtOf(status, event, remote),
            paidAt: paidAtOf(status, event, remote),
            overdueAt: status === INVOICE_STATUSES.overdue ? event.occurredAt : null
        };
    }

    private async onPaid(subscription: BillingSubscription, invoice: BillingInvoice, at: Date): Promise<void> {
        const paidAt: Date = invoice.paidAt ?? at;
        const paidThrough: Date = invoice.cycleEnd ?? addMonthsUtc(paidAt, 1);
        await this.subscriptions.recordPayment(subscription, paidThrough, paidAt);
        if (subscription.status !== SUBSCRIPTION_STATUSES.active) {
            return;
        }
        await this.contracts.open('premium', { startsAt: paidAt, subscriptionId: subscription.id });
        await this.contracts.convertCardTrial('premium');
        this.logs.subscription('activated', subscription.id, subscription.paymentMethod);
        await this.mailer.notify({ kind: NOTIFICATION_KINDS.activated, subjectId: subscription.id, paidThroughDay: paidThrough });
    }

    private async applyChargeFailed(event: AppliedEvent): Promise<void> {
        const engineInvoiceId: string | undefined = event.data.invoiceId;
        const invoice: BillingInvoice | null =
            engineInvoiceId === undefined ? null : await this.invoices.findByEngineId(this.engine.engine, engineInvoiceId);
        if (invoice !== null) {
            await this.invoices.markChargeFailed(invoice.id, event.occurredAt);
        }
    }

    private async reapplyChargeFailed(subscription: BillingSubscription, invoice: BillingInvoice): Promise<void> {
        if (subscription.engineSubscriptionId === null || invoice.chargeFailedAt !== null) {
            return;
        }
        const since: Date = DateUtil.addDays(new Date(), -CHARGE_FAILED_LOOKBACK_DAYS);
        const stored: RevtrieverEvent[] = await this.events.listOfTypeSince(EVENT_TYPES.chargeFailed, since);
        const failure: AppliedEvent | null | undefined = stored
            .map(appliedEventOf)
            .find(
                (event: AppliedEvent | null): boolean =>
                    event?.data.invoiceId === invoice.engineInvoiceId && event.data.subscriptionId === subscription.engineSubscriptionId
            );
        if (failure !== undefined && failure !== null) {
            await this.invoices.markChargeFailed(invoice.id, failure.occurredAt);
        }
    }

    private async applyCanceled(subscription: BillingSubscription, event: AppliedEvent): Promise<void> {
        await this.subscriptions.markCanceledByEngine(subscription, dateOf(event.data.canceledAt) ?? event.occurredAt);
        if (subscription.cancelRequestedAt === null && subscription.paidThrough !== null) {
            this.logs.subscription('canceled', subscription.id, subscription.paymentMethod);
            await this.mailer.notify({
                kind: NOTIFICATION_KINDS.canceled,
                subjectId: subscription.id,
                paidThroughDay: subscription.paidThrough
            });
        }
    }

    private async applyCardSaved(subscription: BillingSubscription, event: AppliedEvent): Promise<void> {
        const last4: string | null | undefined = event.data.lastFourDigits ?? event.data.last4;
        if (last4 !== null && last4 !== undefined) {
            await this.subscriptions.saveCard(subscription.id, event.data.brand ?? null, last4);
        }
    }
}
