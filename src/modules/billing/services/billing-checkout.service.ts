import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { AsCompany } from '../../../core/context/as-company.decorator';
import { DateUtil } from '../../../shared/utils/date.util';
import { PlanContractService, TrialContract } from '../../plans/services/plan-contract.service';
import { PlanGateService } from '../../plans/services/plan-gate.service';
import { billingConfig } from '../config/billing.config';
import {
    AlreadySubscribedError,
    BillingEngineRejectedError,
    BillingProviderDisabledError,
    NotResumableError,
    SelfHostedNotAvailableError,
    TrialRequiresCardError
} from '../domain/billing-engine.errors';
import { PaymentMethod } from '../domain/billing-engine.types';
import { BillingTrialService, CardTrialOffer } from './billing-trial.service';
import { CardTrialDates, resumableUntilOf } from '../domain/billing-trial.rules';
import { BillingSubscriptionDomain } from '../domain/billing-subscription.domain';
import { BillingSubscription, PROVISIONING_STALE_MINUTES, SUBSCRIPTION_STATUSES, SWEEP_BATCH } from '../domain/billing.types';
import { BillingEnginePort } from '../ports/billing-engine.port';
import { BillingLogService } from './billing-log.service';
import { BillingMetricsService } from './billing-metrics.service';
import { BillingProvisioningService } from './billing-provisioning.service';

export type SubscribeResult = { readonly next: 'card_capture'; readonly captureUrl: string } | { readonly next: 'pay_invoice' };

const FAKE_PLAN_ID: string = 'fake-premium-monthly';

@Injectable()
export class BillingCheckoutService {
    public constructor(
        @Inject(billingConfig.KEY) private readonly config: ConfigType<typeof billingConfig>,
        private readonly engine: BillingEnginePort,
        private readonly gate: PlanGateService,
        private readonly contracts: PlanContractService,
        private readonly provisioning: BillingProvisioningService,
        private readonly trials: BillingTrialService,
        private readonly subscriptions: BillingSubscriptionDomain,
        private readonly logs: BillingLogService,
        private readonly metrics: BillingMetricsService
    ) {}

    public async subscribe(method: PaymentMethod): Promise<SubscribeResult> {
        this.assertAvailable();
        const trial: TrialContract | null = await this.contracts.trialOf('premium');
        if ((await this.gate.planOf()) === 'premium' && trial?.subscriptionId !== null) {
            throw new AlreadySubscribedError();
        }
        const cardTrial: CardTrialOffer | null = await this.trials.offerOf();
        if (cardTrial !== null && method !== 'card') {
            throw new TrialRequiresCardError();
        }
        const dates: CardTrialDates | null = cardTrial === null ? null : await this.trials.datesOf(cardTrial, new Date());
        const row: BillingSubscription = await this.reservedRow(
            method,
            dates?.firstChargeDate ?? (await this.firstChargeDateOf(trial)),
            dates?.trialEndsAt ?? null
        );
        const active: BillingSubscription = row.status === SUBSCRIPTION_STATUSES.pending ? await this.provisionCounting(row) : row;
        if (trial !== null) {
            await this.contracts.attachSubscription('premium', active.id);
        }
        this.logs.subscription('subscribed', active.id, active.paymentMethod);
        this.metrics.subscription(active.paymentMethod, 'ok');
        return this.nextStepOf(active);
    }

    public async resume(): Promise<void> {
        this.assertAvailable();
        const current: BillingSubscription | null = await this.subscriptions.findCurrent(this.engine.engine);
        const paidThrough: Date | null = resumableUntilOf(current);
        if (current === null || paidThrough === null || new Date() >= paidThrough) {
            throw new NotResumableError();
        }
        const trialDates: CardTrialDates | null =
            current.trialEndsAt === null ? null : await this.trials.resumeDatesOf(current.trialEndsAt);
        const fresh: BillingSubscription = await this.reservedRow(
            current.paymentMethod === 'card' ? 'card' : 'pix',
            trialDates?.firstChargeDate ?? DateUtil.onlyDateString(paidThrough),
            trialDates?.trialEndsAt ?? null
        );
        const active: BillingSubscription = await this.provisionCounting(fresh);
        await this.provisioning.inheritCard(active);
        await this.trials.carryOver(active);
        this.logs.subscription('resumed', active.id, active.paymentMethod);
    }

    public async rescue(): Promise<number> {
        const stale: BillingSubscription[] = await this.subscriptions.listStalePendingAcrossTenants(
            DateUtil.addMinutes(new Date(), -PROVISIONING_STALE_MINUTES),
            SWEEP_BATCH
        );
        for (const row of stale) {
            await this.rescueOne(row.companyId, row);
        }
        return stale.length;
    }

    @AsCompany()
    private async rescueOne(_companyId: string, row: BillingSubscription): Promise<void> {
        try {
            await this.provisioning.provision(row);
        } catch (error: unknown) {
            this.metrics.subscription(row.paymentMethod, error instanceof BillingEngineRejectedError ? 'rejected' : 'unavailable');
        }
    }

    private assertAvailable(): void {
        if (this.gate.mode() === 'self_hosted') {
            throw new SelfHostedNotAvailableError();
        }
        if (!this.config.BILLING_ENGINE_ENABLED) {
            throw new BillingProviderDisabledError();
        }
    }

    private async firstChargeDateOf(trial: TrialContract | null): Promise<string> {
        const today: string = await this.provisioning.todayInCompany();
        const trialEnd: string | null = trial === null ? null : DateUtil.onlyDateString(trial.endsAt);
        return trialEnd !== null && trialEnd > today ? trialEnd : today;
    }

    private async reservedRow(method: PaymentMethod, firstChargeDate: string, trialEndsAt: Date | null): Promise<BillingSubscription> {
        const reserved: BillingSubscription | null = await this.subscriptions.reserve({
            engine: this.engine.engine,
            planId: this.config.REVTRIEVER_PLAN_ID ?? FAKE_PLAN_ID,
            paymentMethod: method,
            firstChargeDate,
            trialEndsAt
        });
        if (reserved !== null) {
            return reserved;
        }
        const open: BillingSubscription | null = await this.subscriptions.findOpen(this.engine.engine);
        if (open === null || (open.status === SUBSCRIPTION_STATUSES.active && !this.awaitsCard(open))) {
            throw new AlreadySubscribedError();
        }
        return open;
    }

    private awaitsCard(row: BillingSubscription): boolean {
        return row.paymentMethod === 'card' && row.cardLast4 === null;
    }

    private async provisionCounting(row: BillingSubscription): Promise<BillingSubscription> {
        try {
            return await this.provisioning.provision(row);
        } catch (error: unknown) {
            this.metrics.subscription(row.paymentMethod, error instanceof BillingEngineRejectedError ? 'rejected' : 'unavailable');
            throw error;
        }
    }

    private async nextStepOf(row: BillingSubscription): Promise<SubscribeResult> {
        if (row.paymentMethod !== 'card') {
            return { next: 'pay_invoice' };
        }
        const session: { captureUrl: string } = await this.provisioning.captureSession(row, `vera-capture-${row.id}`);
        return { next: 'card_capture', captureUrl: session.captureUrl };
    }
}
