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
    PlatformCompanyCannotSubscribeError,
    SelfHostedNotAvailableError,
    TrialRequiresCardError
} from '../domain/billing-engine.errors';
import { PaymentMethod } from '../domain/billing-engine.types';
import { BillingTrialService, CardTrialOffer } from './billing-trial.service';
import { CardTrialDates, resumableUntilOf } from '../domain/billing-trial.rules';
import { BillingSubscription, PROVISIONING_STALE_MINUTES, SUBSCRIPTION_STATUSES, SWEEP_BATCH } from '../domain/billing.types';
import { BillingLogService } from './billing-log.service';
import { BillingMetricsService } from './billing-metrics.service';
import { BillingProvisioningService } from './billing-provisioning.service';
import { BillingReservationService } from './billing-reservation.service';

export type SubscribeResult = { readonly next: 'card_capture'; readonly captureUrl: string } | { readonly next: 'pay_invoice' };

@Injectable()
export class BillingCheckoutService {
    public constructor(
        @Inject(billingConfig.KEY) private readonly config: ConfigType<typeof billingConfig>,
        private readonly gate: PlanGateService,
        private readonly contracts: PlanContractService,
        private readonly provisioning: BillingProvisioningService,
        private readonly trials: BillingTrialService,
        private readonly reservations: BillingReservationService,
        private readonly logs: BillingLogService,
        private readonly metrics: BillingMetricsService
    ) {}

    public async subscribe(method: PaymentMethod): Promise<SubscribeResult> {
        await this.assertCanSubscribe();
        const trial: TrialContract | null = await this.contracts.trialOf('premium');
        if ((await this.gate.planOf()) === 'premium' && trial?.subscriptionId !== null) {
            throw new AlreadySubscribedError();
        }
        const cardTrial: CardTrialOffer | null = await this.trials.offerOf();
        if (cardTrial !== null && method !== 'card') {
            throw new TrialRequiresCardError();
        }
        const dates: CardTrialDates | null = cardTrial === null ? null : await this.trials.datesOf(cardTrial, new Date());
        const row: BillingSubscription = await this.reservations.forSubscribe(method, trial, dates);
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
        const current: BillingSubscription | null = await this.reservations.currentOf();
        const paidThrough: Date | null = resumableUntilOf(current);
        if (current === null || paidThrough === null || new Date() >= paidThrough) {
            throw new NotResumableError();
        }
        const trialDates: CardTrialDates | null =
            current.trialEndsAt === null ? null : await this.trials.resumeDatesOf(current.trialEndsAt);
        const fresh: BillingSubscription = await this.reservations.forResume(current, paidThrough, trialDates);
        const active: BillingSubscription = await this.provisionCounting(fresh);
        await this.provisioning.inheritCard(active, current);
        await this.provisioning.inheritPaidPeriod(active, current);
        await this.trials.carryOver(active);
        this.logs.subscription('resumed', active.id, active.paymentMethod);
    }

    public async rescue(): Promise<number> {
        const stale: BillingSubscription[] = await this.reservations.stalePendingOf(
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

    private async assertCanSubscribe(): Promise<void> {
        this.assertAvailable();
        if (await this.contracts.isPlatformCompany()) {
            throw new PlatformCompanyCannotSubscribeError();
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
