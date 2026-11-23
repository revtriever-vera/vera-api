import { Injectable } from '@nestjs/common';
import { BillingOfferPort, BillingOfferSnapshot, UsableOffer } from '../../plans/services/billing-offer.port';
import { SignupRedemptionDomain } from '../domain/signup-redemption.domain';
import { SignupRedemption, TRIAL_KINDS } from '../domain/signup-links.types';
import { SignupLinkViewMapper } from './signup-link-view.mapper';

@Injectable()
export class BillingOfferAdapter extends BillingOfferPort {
    public constructor(
        private readonly redemptions: SignupRedemptionDomain,
        private readonly mapper: SignupLinkViewMapper
    ) {
        super();
    }

    public async trialStarted(at: Date): Promise<void> {
        await this.redemptions.markTrialStarted(at);
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

    public async release(): Promise<void> {
        await this.redemptions.release(new Date());
    }

    public async markApplied(): Promise<boolean> {
        return this.redemptions.markApplied(new Date());
    }
}
