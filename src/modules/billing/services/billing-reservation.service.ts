import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { UsingTransaction } from '../../../core/database/using-transaction.decorator';
import { DateUtil } from '../../../shared/utils/date.util';
import { BillingOfferRule, UsableOffer } from '../../plans/services/billing-offer.port';
import { BillingOfferRegistry } from '../../plans/services/billing-offer.registry';
import { TrialContract } from '../../plans/services/plan-contract.service';
import { billingConfig } from '../config/billing.config';
import { AlreadySubscribedError } from '../domain/billing-engine.errors';
import { PaymentMethod } from '../domain/billing-engine.types';
import { BillingPriceQuoteDomain } from '../domain/billing-price-quote.domain';
import { BillingSubscriptionDomain } from '../domain/billing-subscription.domain';
import { CardTrialDates } from '../domain/billing-trial.rules';
import { BillingSubscription, SUBSCRIPTION_STATUSES } from '../domain/billing.types';
import { BillingEnginePort } from '../ports/billing-engine.port';
import { discountRulesSchema } from '../validation/billing-discount.schemas';
import { BillingProvisioningService } from './billing-provisioning.service';

const FAKE_PLAN_ID: string = 'fake-premium-monthly';

interface ReservedDiscount {
    readonly rules: readonly BillingOfferRule[];
    readonly cycleOffset: number;
    readonly consumesOffer: boolean;
}

interface ReservationRequest {
    readonly method: PaymentMethod;
    readonly firstChargeDate: string;
    readonly discount: ReservedDiscount;
    readonly trialEndsAt: Date | null;
}

@Injectable()
export class BillingReservationService {
    public constructor(
        @Inject(billingConfig.KEY) private readonly config: ConfigType<typeof billingConfig>,
        private readonly engine: BillingEnginePort,
        private readonly subscriptions: BillingSubscriptionDomain,
        private readonly quotes: BillingPriceQuoteDomain,
        private readonly offers: BillingOfferRegistry,
        private readonly provisioning: BillingProvisioningService
    ) {}

    public async currentOf(): Promise<BillingSubscription | null> {
        return this.subscriptions.findCurrent(this.engine.engine);
    }

    public async stalePendingOf(before: Date, limit: number): Promise<BillingSubscription[]> {
        return this.subscriptions.listStalePendingAcrossTenants(before, limit);
    }

    public async forSubscribe(
        method: PaymentMethod,
        trial: TrialContract | null,
        cardTrial: CardTrialDates | null = null
    ): Promise<BillingSubscription> {
        const offer: UsableOffer | null = await this.offers.usable();
        return this.reserved({
            method,
            firstChargeDate: cardTrial?.firstChargeDate ?? (await this.firstChargeDateOf(trial, offer)),
            trialEndsAt: cardTrial?.trialEndsAt ?? null,
            discount: { rules: offer?.rules ?? [], cycleOffset: 0, consumesOffer: offer !== null }
        });
    }

    public async forResume(
        previous: BillingSubscription,
        paidThrough: Date,
        cardTrial: CardTrialDates | null = null
    ): Promise<BillingSubscription> {
        return this.reserved({
            method: previous.paymentMethod === 'card' ? 'card' : 'pix',
            firstChargeDate: cardTrial?.firstChargeDate ?? DateUtil.onlyDateString(paidThrough),
            trialEndsAt: cardTrial?.trialEndsAt ?? null,
            discount: await this.inheritedDiscountOf(previous)
        });
    }

    private async firstChargeDateOf(trial: TrialContract | null, offer: UsableOffer | null): Promise<string> {
        const today: string = await this.provisioning.todayInCompany();
        if (trial !== null) {
            const trialEnd: string = DateUtil.onlyDateString(trial.endsAt);
            return trialEnd > today ? trialEnd : today;
        }
        const days: number | null = offer?.cardTrialDays ?? null;
        return days === null ? today : DateUtil.onlyDateString(DateUtil.addDays(new Date(`${today}T00:00:00Z`), days));
    }

    private async inheritedDiscountOf(previous: BillingSubscription): Promise<ReservedDiscount> {
        const rules: BillingOfferRule[] = discountRulesSchema.parse(previous.discountRules);
        if (rules.length === 0) {
            return { rules, cycleOffset: 0, consumesOffer: false };
        }
        const pricedCycles: number = await this.quotes.lastCycleOf(previous.id);
        return { rules, cycleOffset: previous.discountCycleOffset + pricedCycles, consumesOffer: false };
    }

    @UsingTransaction()
    private async reserved(request: ReservationRequest): Promise<BillingSubscription> {
        const reserved: BillingSubscription | null = await this.subscriptions.reserve({
            engine: this.engine.engine,
            planId: this.config.REVTRIEVER_PLAN_ID ?? FAKE_PLAN_ID,
            paymentMethod: request.method,
            firstChargeDate: request.firstChargeDate,
            trialEndsAt: request.trialEndsAt,
            discountRules: request.discount.rules,
            discountCycleOffset: request.discount.cycleOffset
        });
        if (reserved !== null) {
            if (request.discount.consumesOffer) {
                await this.offers.markApplied();
            }
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
}
