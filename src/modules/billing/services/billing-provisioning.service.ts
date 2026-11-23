import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { CompanyTimezoneService } from '../../identity/services/company-timezone.service';
import { OwnerRecipient, OwnerRecipientsService } from '../../identity/services/owner-recipients.service';
import { billingConfig } from '../config/billing.config';
import { BillingEngineRejectedError, NoSubscriptionError } from '../domain/billing-engine.errors';
import { CardCaptureSession, EngineSubscription, SavedCard } from '../domain/billing-engine.types';
import { BillingSubscriptionDomain } from '../domain/billing-subscription.domain';
import { BillingSubscription, MAX_CHARGE_DAY, RevtrieverEvent } from '../domain/billing.types';
import { BillingEnginePort } from '../ports/billing-engine.port';
import { BillingMetricsService } from './billing-metrics.service';
import { RevtrieverEventIngestService } from './revtriever-event-ingest.service';
import { RevtrieverEventDomain } from '../domain/revtriever-event.domain';

const LINK_REPLAY_BATCH: number = 100;

function chargeDayOf(firstChargeDate: string): number {
    return Math.min(Number(firstChargeDate.slice(8, 10)), MAX_CHARGE_DAY);
}

@Injectable()
export class BillingProvisioningService {
    public constructor(
        @Inject(billingConfig.KEY) private readonly config: ConfigType<typeof billingConfig>,
        private readonly engine: BillingEnginePort,
        private readonly subscriptions: BillingSubscriptionDomain,
        private readonly owners: OwnerRecipientsService,
        private readonly timezone: CompanyTimezoneService,
        private readonly metrics: BillingMetricsService,
        private readonly events: RevtrieverEventDomain,
        private readonly ingestion: RevtrieverEventIngestService
    ) {}

    public async todayInCompany(): Promise<string> {
        return this.timezone.todayInCompany();
    }

    public async provision(row: BillingSubscription): Promise<BillingSubscription> {
        const owner: OwnerRecipient = await this.ownerOf();
        const firstChargeDate: string = row.firstChargeDate ?? (await this.timezone.todayInCompany());
        const created: EngineSubscription = await this.create(row, owner, firstChargeDate);
        const active: BillingSubscription | null = await this.subscriptions.activate(row.id, {
            engineSubscriptionId: created.id,
            engineCustomerId: created.customerId,
            chargeDay: chargeDayOf(firstChargeDate)
        });
        await this.reprocessWaitingEvents(created.id);
        return active ?? (await this.subscriptions.findById(row.id)) ?? row;
    }

    private async reprocessWaitingEvents(engineSubscriptionId: string): Promise<void> {
        const waiting: RevtrieverEvent[] = await this.events.listReceivedOfSubscription(engineSubscriptionId, LINK_REPLAY_BATCH);
        for (const event of waiting) {
            await this.ingestion.publish(event, true);
        }
    }

    public async captureSession(subscription: BillingSubscription, idempotencyKey: string): Promise<CardCaptureSession> {
        if (subscription.engineSubscriptionId === null) {
            throw new NoSubscriptionError();
        }
        return this.engine.createCardCaptureSession(
            subscription.engineSubscriptionId,
            `${this.config.APP_URL}/settings/plan?card=saved`,
            idempotencyKey
        );
    }

    public async inheritPaidPeriod(subscription: BillingSubscription, previous: BillingSubscription): Promise<void> {
        if (previous.paidThrough !== null) {
            await this.subscriptions.carryPaidPeriod(subscription.id, previous.paidThrough);
        }
    }

    public async inheritCard(subscription: BillingSubscription, previous: BillingSubscription | null = null): Promise<void> {
        const card: SavedCard | null =
            subscription.engineSubscriptionId === null ? null : await this.engine.savedCardOf(subscription.engineSubscriptionId);
        if (card !== null) {
            await this.subscriptions.saveCard(subscription.id, card.brand, card.last4);
            return;
        }
        if (previous?.cardLast4 !== null && previous?.cardLast4 !== undefined && subscription.cardLast4 === null) {
            await this.subscriptions.saveCard(subscription.id, previous.cardBrand, previous.cardLast4);
        }
    }

    private async create(row: BillingSubscription, owner: OwnerRecipient, firstChargeDate: string): Promise<EngineSubscription> {
        try {
            return await this.engine.createSubscription({
                idempotencyKey: `vera-subscription-${row.id}`,
                planId: row.planId,
                customer: { externalRef: row.companyId, name: owner.firstName, email: owner.email },
                paymentMethod: row.paymentMethod === 'card' ? 'card' : 'pix',
                firstChargeDate
            });
        } catch (error: unknown) {
            if (error instanceof BillingEngineRejectedError) {
                await this.subscriptions.fail(row.id);
                this.metrics.subscription(row.paymentMethod, 'rejected');
            }
            throw error;
        }
    }

    private async ownerOf(): Promise<OwnerRecipient> {
        const owner: OwnerRecipient | undefined = (await this.owners.list())[0];
        if (owner === undefined) {
            throw new NoSubscriptionError();
        }
        return owner;
    }
}
