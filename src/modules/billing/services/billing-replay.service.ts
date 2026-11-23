import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { DateUtil } from '../../../shared/utils/date.util';
import { billingConfig } from '../config/billing.config';
import { EngineEvent, EngineEventPage, EngineInvoice, EnginePage, ListedInvoiceStatus } from '../domain/billing-engine.types';
import { BillingInvoiceDomain } from '../domain/billing-invoice.domain';
import { BillingSubscriptionDomain } from '../domain/billing-subscription.domain';
import { advancedInvoiceStatus, isInvoiceInWindow, isInvoiceStatus } from '../domain/billing-invoice.rules';
import {
    BillingInvoice,
    BillingSubscription,
    EVENT_STALE_MINUTES,
    EVENTS_CURSOR_SOURCE,
    INVOICE_STATUSES,
    InvoiceRowStatus,
    RevtrieverEvent,
    SWEEP_BATCH
} from '../domain/billing.types';
import { RevtrieverEventCursorDomain } from '../domain/revtriever-event-cursor.domain';
import { RevtrieverEventDomain } from '../domain/revtriever-event.domain';
import { BillingEnginePort } from '../ports/billing-engine.port';
import { WebhookEvent } from '../validation/revtriever-events.schemas';
import { BillingLogService } from './billing-log.service';
import { RevtrieverEventIngestService } from './revtriever-event-ingest.service';

const REPLAY_PAGE_SIZE: number = 100;
const REPLAY_MAX_PAGES: number = 20;
const REPUBLISH_BATCH: number = 200;
const RECONCILE_MAX_PAGES: number = 20;
const LISTED_STATUSES: readonly ListedInvoiceStatus[] = [INVOICE_STATUSES.issued, INVOICE_STATUSES.overdue, INVOICE_STATUSES.paid];
const EVENT_TYPE_OF_STATUS: Readonly<Record<InvoiceRowStatus, string>> = {
    [INVOICE_STATUSES.issued]: 'invoice.issued',
    [INVOICE_STATUSES.overdue]: 'invoice.overdue',
    [INVOICE_STATUSES.paid]: 'invoice.paid'
};

export interface ReconcileResult {
    readonly checked: number;
    readonly fixed: number;
    readonly created: number;
}

function webhookEventOf(event: EngineEvent): WebhookEvent {
    return { id: event.id, type: event.type, occurredAt: event.createdAt, data: { ...event.data } };
}

@Injectable()
export class BillingReplayService {
    public constructor(
        private readonly engine: BillingEnginePort,
        private readonly ingestion: RevtrieverEventIngestService,
        private readonly events: RevtrieverEventDomain,
        private readonly cursors: RevtrieverEventCursorDomain,
        private readonly invoices: BillingInvoiceDomain,
        private readonly subscriptions: BillingSubscriptionDomain,
        @Inject(billingConfig.KEY) private readonly config: ConfigType<typeof billingConfig>,
        private readonly logs: BillingLogService
    ) {}

    public async replay(): Promise<number> {
        const ingested: number = await this.pullFromCursor();
        const stalled: RevtrieverEvent[] = await this.events.listStalledReceived(
            DateUtil.addMinutes(new Date(), -EVENT_STALE_MINUTES),
            REPUBLISH_BATCH
        );
        for (const event of stalled) {
            await this.ingestion.publish(event, true);
        }
        return ingested + stalled.length;
    }

    public async reconcile(): Promise<ReconcileResult> {
        const open: BillingInvoice[] = await this.invoices.listOpenAcrossTenants(SWEEP_BATCH);
        let fixed: number = 0;
        for (const local of open) {
            fixed += (await this.reconcileOne(local)) ? 1 : 0;
        }
        const missing: { checked: number; created: number } = await this.createMissing();
        const result: ReconcileResult = { checked: open.length + missing.checked, fixed, created: missing.created };
        this.logs.reconciled(result.checked, result.fixed, result.created);
        return result;
    }

    private async pullFromCursor(): Promise<number> {
        let cursor: string | null = await this.cursors.cursorOf(EVENTS_CURSOR_SOURCE);
        let ingested: number = 0;
        for (let pages: number = 0; pages < REPLAY_MAX_PAGES; pages += 1) {
            const page: EngineEventPage = await this.engine.eventsAfter(cursor, REPLAY_PAGE_SIZE);
            ingested += await this.ingestAll(page.items);
            if (page.next === null) {
                return ingested;
            }
            cursor = page.next;
            await this.cursors.save(EVENTS_CURSOR_SOURCE, cursor);
        }
        return ingested;
    }

    private async ingestAll(items: readonly EngineEvent[]): Promise<number> {
        let ingested: number = 0;
        for (const event of items) {
            ingested += (await this.ingestion.ingest(webhookEventOf(event))) ? 1 : 0;
        }
        return ingested;
    }

    /** Faturas da Revtriever na janela que a Vera nunca recebeu (webhook perdido): entram pelo mesmo caminho idempotente dos eventos. */
    private async createMissing(): Promise<{ checked: number; created: number }> {
        const since: Date = DateUtil.addDays(new Date(), -this.config.BILLING_RECONCILE_WINDOW_DAYS);
        const listed: EngineInvoice[] = [];
        for (const status of LISTED_STATUSES) {
            listed.push(...(await this.listedWithStatus(status)));
        }
        const inWindow: EngineInvoice[] = listed.filter((invoice: EngineInvoice): boolean => isInvoiceInWindow(invoice, since));
        let created: number = 0;
        for (const remote of inWindow) {
            created += (await this.createIfMissing(remote)) ? 1 : 0;
        }
        return { checked: inWindow.length, created };
    }

    private async listedWithStatus(status: ListedInvoiceStatus): Promise<EngineInvoice[]> {
        const found: EngineInvoice[] = [];
        for (let page: number = 1; page <= RECONCILE_MAX_PAGES; page += 1) {
            const result: EnginePage<EngineInvoice> | null = await this.pageOf(status, page);
            if (result === null) {
                return found;
            }
            found.push(...result.items);
            if (result.items.length === 0 || page * result.pageSize >= result.total) {
                return found;
            }
        }
        return found;
    }

    private async pageOf(status: ListedInvoiceStatus, page: number): Promise<EnginePage<EngineInvoice> | null> {
        try {
            return await this.engine.invoicesWithStatus(status, page);
        } catch {
            return null;
        }
    }

    private async createIfMissing(remote: EngineInvoice): Promise<boolean> {
        if (!isInvoiceStatus(remote.status)) {
            return false;
        }
        const status: InvoiceRowStatus = remote.status;
        const linked: BillingSubscription | null = await this.subscriptions.findByEngineSubscriptionIdAcrossTenants(
            this.engine.engine,
            remote.subscriptionId
        );
        if (linked === null || (await this.invoices.existsByEngineIdAcrossTenants(this.engine.engine, remote.id))) {
            return false;
        }
        return this.ingestion.ingest(this.reconciliationEvent(remote, status));
    }

    private reconciliationEvent(remote: EngineInvoice, status: InvoiceRowStatus): WebhookEvent {
        return {
            id: `reconciliation-${remote.id}-${status}`,
            type: EVENT_TYPE_OF_STATUS[status],
            occurredAt: new Date().toISOString(),
            data: {
                invoiceId: remote.id,
                subscriptionId: remote.subscriptionId,
                totalCents: remote.totalCents,
                dueDate: remote.dueDate,
                paidAt: remote.paidAt
            }
        };
    }

    private async reconcileOne(local: BillingInvoice): Promise<boolean> {
        const remote: EngineInvoice | null = await this.remoteOf(local);
        if (remote === null || !isInvoiceStatus(remote.status)) {
            return false;
        }
        const status: InvoiceRowStatus = remote.status;
        if (advancedInvoiceStatus(isInvoiceStatus(local.status) ? local.status : INVOICE_STATUSES.issued, status) === local.status) {
            return false;
        }
        return this.ingestion.ingest({
            id: `reconciliation-${local.engineInvoiceId}-${status}`,
            type: status === INVOICE_STATUSES.paid ? 'invoice.paid' : 'invoice.overdue',
            occurredAt: new Date().toISOString(),
            data: {
                invoiceId: local.engineInvoiceId,
                subscriptionId: remote.subscriptionId,
                totalCents: remote.totalCents,
                paidAt: remote.paidAt
            }
        });
    }

    private async remoteOf(local: BillingInvoice): Promise<EngineInvoice | null> {
        try {
            return await this.engine.invoiceOf(local.engineInvoiceId);
        } catch {
            return null;
        }
    }
}
