import { Injectable } from '@nestjs/common';
import { LoginOfferInput, LoginOfferOutcome, LoginOfferPort } from '../../identity/services/login-offer.port';
import { REDEMPTION_SOURCES, RedeemSubject } from '../domain/signup-links.types';
import { OfferRedemptionService } from './offer-redemption.service';

@Injectable()
export class LoginOfferAdapter extends LoginOfferPort {
    public constructor(private readonly redemption: OfferRedemptionService) {
        super();
    }

    public async redeem(input: LoginOfferInput): Promise<LoginOfferOutcome | null> {
        if (!this.redemption.enabled()) {
            return null;
        }
        const subject: RedeemSubject = {
            companyId: input.user.companyId,
            userId: input.user.id,
            email: input.user.email,
            emailVerified: input.user.emailVerifiedAt !== null,
            isOwner: input.user.role === 'owner',
            ip: input.ip
        };
        const source: 'signup' | 'existing_account' = input.isNewAccount ? REDEMPTION_SOURCES.signup : REDEMPTION_SOURCES.existingAccount;
        await this.redemption.redeem(input.token, subject, source);
        return { redeemed: true, reason: null };
    }
}
