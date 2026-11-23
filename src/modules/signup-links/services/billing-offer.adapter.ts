import { Injectable } from '@nestjs/common';
import { BillingOfferPort, BillingOfferSnapshot, UsableOffer } from '../../plans/services/billing-offer.port';
import { UsingTransaction } from '../../../core/database/using-transaction.decorator';
import { SignupLinkDomain } from '../domain/signup-link.domain';
import { SignupRedemptionDomain } from '../domain/signup-redemption.domain';
import { SignupRedemption, TRIAL_KINDS } from '../domain/signup-links.types';
import { SignupLinkViewMapper } from './signup-link-view.mapper';

@Injectable()
export class BillingOfferAdapter extends BillingOfferPort {
    public constructor(
        private readonly redemptions: SignupRedemptionDomain,
        private readonly links: SignupLinkDomain,
        private readonly mapper: SignupLinkViewMapper
    ) {
        super();
    }

    @UsingTransaction()
    public async trialStarted(at: Date): Promise<void> {
        const redemption: SignupRedemption | null = await this.redemptions.current();
        if (redemption !== null && (await this.redemptions.markTrialStarted(at))) {
            await this.links.countFunnel(redemption.signupLinkId, { trials: 1, subscriptions: 0 }, at);
        }
    }

    public async offer(): Promise<BillingOfferSnapshot | null> {
        const redemption: SignupRedemption | null = await this.redemptions.current();
        if (redemption === null) {
            return null;
        }
        const consumed: boolean = redemption.appliedAt !== null || redemption.expiresAt.getTime() <= Date.now();
        return consumed ? null : this.mapper.toRedeemedView(redemption);
    }

    public async usable(): Promise<UsableOffer | null> {
        const snapshot: BillingOfferSnapshot | null = await this.offer();
        if (snapshot === null) {
            return null;
        }
        const isCardTrial: boolean = snapshot.trial.kind === TRIAL_KINDS.card;
        return { rules: snapshot.rules, cardTrialDays: isCardTrial ? snapshot.trial.days : null };
    }

    @UsingTransaction()
    public async release(): Promise<void> {
        const now: Date = new Date();
        const redemption: SignupRedemption | null = await this.redemptions.current();
        const wasApplied: boolean = redemption !== null && redemption.appliedAt !== null && redemption.trialStartedAt === null;
        const released: boolean = await this.redemptions.release(now);
        if (redemption !== null && wasApplied && released) {
            await this.links.countFunnel(redemption.signupLinkId, { trials: 0, subscriptions: -1 }, now);
        }
    }

    @UsingTransaction()
    public async markApplied(): Promise<boolean> {
        const now: Date = new Date();
        const redemption: SignupRedemption | null = await this.redemptions.current();
        const applied: boolean = await this.redemptions.markApplied(now);
        if (redemption !== null && applied) {
            await this.links.countFunnel(redemption.signupLinkId, { trials: 0, subscriptions: 1 }, now);
        }
        return applied;
    }
}
