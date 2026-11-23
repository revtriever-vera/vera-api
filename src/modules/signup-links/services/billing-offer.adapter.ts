import { Injectable } from '@nestjs/common';
import { BillingOfferPort, BillingOfferSnapshot } from '../../plans/services/billing-offer.port';
import { SignupRedemptionDomain } from '../domain/signup-redemption.domain';
import { SignupRedemption } from '../domain/signup-links.types';
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
        if (redemption === null || redemption.expiresAt.getTime() <= Date.now()) {
            return null;
        }
        return this.mapper.toRedeemedView(redemption);
    }
}
