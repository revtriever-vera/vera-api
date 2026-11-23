import { Injectable } from '@nestjs/common';
import { AsCompany } from '../../../core/context/as-company.decorator';
import { AppError } from '../../../shared/errors/app.error';
import { DateUtil } from '../../../shared/utils/date.util';
import { CompanyTimezoneService } from '../../identity/services/company-timezone.service';
import { BillingOfferRegistry } from '../../plans/services/billing-offer.registry';
import { BillingOfferRule, BillingOfferSnapshot } from '../../plans/services/billing-offer.port';
import { PlanContractService } from '../../plans/services/plan-contract.service';
import { SavedCard } from '../domain/billing-engine.types';
import { discountedPriceOf } from '../domain/billing-offer-price.rules';
import { BillingSubscriptionDomain } from '../domain/billing-subscription.domain';
import { cardTrialDatesOf, CardTrialDates } from '../domain/billing-trial.rules';
import {
    BillingSubscription,
    CARD_CONFIRM_HOURS,
    NOTIFICATION_KINDS,
    SWEEP_BATCH,
    TRIAL_ENDING_NOTICE_DAYS
} from '../domain/billing.types';
import { BillingEnginePort } from '../ports/billing-engine.port';
import { BillingLogService } from './billing-log.service';
import { BillingMailerService } from './billing-mailer.service';
import { BillingStandingService } from './billing-standing.service';

export interface CardTrialOffer {
    readonly days: number;
    readonly rules: readonly BillingOfferRule[];
}

@Injectable()
export class BillingTrialService {
    public constructor(
        private readonly engine: BillingEnginePort,
        private readonly offers: BillingOfferRegistry,
        private readonly contracts: PlanContractService,
        private readonly subscriptions: BillingSubscriptionDomain,
        private readonly timezone: CompanyTimezoneService,
        private readonly standing: BillingStandingService,
        private readonly mailer: BillingMailerService,
        private readonly logs: BillingLogService
    ) {}

    public async offerOf(): Promise<CardTrialOffer | null> {
        const offer: BillingOfferSnapshot | null = await this.offers.current();
        const days: number = offer?.trial.days ?? 0;
        if (offer === null || offer.trial.kind !== 'card' || days <= 0) {
            return null;
        }
        if ((await this.contracts.trialUsed()) || (await this.contracts.everHadPremium())) {
            return null;
        }
        return { days, rules: offer.rules };
    }

    public async datesOf(offer: CardTrialOffer, now: Date): Promise<CardTrialDates> {
        return cardTrialDatesOf(now, offer.days, await this.timezone.timezoneOfCompany());
    }

    public async resumeDatesOf(trialEndsAt: Date): Promise<CardTrialDates> {
        const timeZone: string = await this.timezone.timezoneOfCompany();
        return { firstChargeDate: DateUtil.localDateIn(timeZone, trialEndsAt), trialEndsAt };
    }

    public async start(subscription: BillingSubscription): Promise<void> {
        const trialEndsAt: Date | null = subscription.trialEndsAt;
        const now: Date = new Date();
        if (trialEndsAt === null || subscription.trialStartedAt !== null || subscription.cardLast4 === null || trialEndsAt <= now) {
            return;
        }
        const opened: boolean = await this.contracts.openCardTrial('premium', {
            startsAt: now,
            endsAt: trialEndsAt,
            subscriptionId: subscription.id
        });
        if (!opened) {
            await this.contracts.attachSubscription('premium', subscription.id);
        }
        await this.subscriptions.markTrialStarted(subscription.id, now);
        await this.offers.trialStarted(now);
        await this.standing.recompute(now);
        if (opened) {
            this.logs.subscription('trial_started', subscription.id, subscription.paymentMethod);
            await this.mailer.notify({
                kind: NOTIFICATION_KINDS.trialStarted,
                subjectId: subscription.id,
                trialEndsAt,
                amountCents: await this.firstAmountOf(),
                cardLast4: subscription.cardLast4
            });
        }
    }

    public async carryOver(subscription: BillingSubscription): Promise<void> {
        if (subscription.trialEndsAt === null) {
            return;
        }
        const now: Date = new Date();
        await this.contracts.attachSubscription('premium', subscription.id);
        await this.subscriptions.markTrialStarted(subscription.id, now);
        await this.standing.recompute(now);
    }

    public async sweep(): Promise<number> {
        const now: Date = new Date();
        const unconfirmed: BillingSubscription[] = await this.subscriptions.listUnconfirmedTrialsAcrossTenants(
            DateUtil.subtractHours(now, CARD_CONFIRM_HOURS),
            SWEEP_BATCH
        );
        for (const row of unconfirmed) {
            await this.settleUnconfirmed(row.companyId, row);
        }
        const ending: BillingSubscription[] = await this.subscriptions.listEndingTrialsAcrossTenants(
            now,
            DateUtil.addDays(now, TRIAL_ENDING_NOTICE_DAYS),
            SWEEP_BATCH
        );
        for (const row of ending) {
            await this.noticeEnding(row.companyId, row);
        }
        return unconfirmed.length + ending.length;
    }

    @AsCompany()
    private async settleUnconfirmed(_companyId: string, row: BillingSubscription): Promise<void> {
        try {
            const card: SavedCard | null =
                row.engineSubscriptionId === null ? null : await this.engine.savedCardOf(row.engineSubscriptionId);
            if (card !== null) {
                await this.subscriptions.saveCard(row.id, card.brand, card.last4);
                const saved: BillingSubscription | null = await this.subscriptions.findById(row.id);
                await this.start(saved ?? row);
                return;
            }
            await this.cancelUnconfirmed(row);
        } catch (error: unknown) {
            if (!(error instanceof AppError)) {
                throw error;
            }
        }
    }

    private async cancelUnconfirmed(row: BillingSubscription): Promise<void> {
        if (row.engineSubscriptionId === null) {
            return;
        }
        await this.engine.cancelSubscription(row.engineSubscriptionId, `vera-trial-unconfirmed-${row.id}`);
        const canceled: BillingSubscription | null = await this.subscriptions.cancel(row, new Date(), false);
        if (canceled !== null) {
            this.logs.subscription('trial_unconfirmed_canceled', row.id, row.paymentMethod);
        }
    }

    @AsCompany()
    private async noticeEnding(_companyId: string, row: BillingSubscription): Promise<void> {
        await this.mailer.notify({
            kind: NOTIFICATION_KINDS.trialEnding,
            subjectId: row.id,
            trialEndsAt: row.trialEndsAt,
            amountCents: await this.firstAmountOf(),
            cardLast4: row.cardLast4
        });
    }

    private async firstAmountOf(): Promise<number> {
        const offer: BillingOfferSnapshot | null = await this.offers.current();
        return discountedPriceOf(await this.contracts.priceCentsOf('premium'), offer?.rules ?? [], 1);
    }
}
