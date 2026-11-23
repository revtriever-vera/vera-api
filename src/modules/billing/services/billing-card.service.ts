import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { DateUtil } from '../../../shared/utils/date.util';
import { BillingEngineRejectedError, NoSubscriptionError } from '../domain/billing-engine.errors';
import { BillingSubscriptionDomain } from '../domain/billing-subscription.domain';
import {
    BillingSubscription,
    CHARGE_FAILED_LOOKBACK_DAYS,
    EVENT_TYPES,
    RevtrieverEvent,
    SUBSCRIPTION_STATUSES
} from '../domain/billing.types';
import { RevtrieverEventDomain } from '../domain/revtriever-event.domain';
import { BillingEnginePort } from '../ports/billing-engine.port';
import { BillingProvisioningService } from './billing-provisioning.service';
import { BillingTrialService } from './billing-trial.service';
import { appliedEventOf } from './revtriever-event-applied';

@Injectable()
export class BillingCardService {
    public constructor(
        private readonly engine: BillingEnginePort,
        private readonly subscriptions: BillingSubscriptionDomain,
        private readonly events: RevtrieverEventDomain,
        private readonly provisioning: BillingProvisioningService,
        private readonly trials: BillingTrialService
    ) {}

    public async captureSession(): Promise<{ captureUrl: string }> {
        const subscription: BillingSubscription = await this.activeRow();
        const session: { captureUrl: string } = await this.provisioning.captureSession(
            subscription,
            `vera-capture-${subscription.id}-${randomUUID()}`
        );
        return { captureUrl: session.captureUrl };
    }

    public async confirm(): Promise<void> {
        const subscription: BillingSubscription = await this.activeRow();
        await this.provisioning.inheritCard(subscription);
        await this.trials.start((await this.subscriptions.findById(subscription.id)) ?? subscription);
        await this.retryHeldInvoices(subscription);
    }

    private async activeRow(): Promise<BillingSubscription> {
        const row: BillingSubscription | null = await this.subscriptions.findOpen(this.engine.engine);
        if (row?.status !== SUBSCRIPTION_STATUSES.active || row.engineSubscriptionId === null) {
            throw new NoSubscriptionError();
        }
        return row;
    }

    private async retryHeldInvoices(subscription: BillingSubscription): Promise<void> {
        const held: RevtrieverEvent[] = await this.events.listOfTypeSince(
            EVENT_TYPES.invoiceHeld,
            DateUtil.addDays(new Date(), -CHARGE_FAILED_LOOKBACK_DAYS)
        );
        const ids: Set<string> = new Set<string>();
        held.forEach((row: RevtrieverEvent): void => {
            const data: { subscriptionId?: string; invoiceId?: string } | undefined = appliedEventOf(row)?.data;
            if (data?.invoiceId !== undefined && data.subscriptionId === subscription.engineSubscriptionId) {
                ids.add(data.invoiceId);
            }
        });
        for (const id of ids) {
            await this.retryPricing(id);
        }
    }

    private async retryPricing(invoiceId: string): Promise<void> {
        try {
            await this.engine.retryInvoicePricing(invoiceId);
        } catch (error: unknown) {
            if (!(error instanceof BillingEngineRejectedError)) {
                throw error;
            }
        }
    }
}
