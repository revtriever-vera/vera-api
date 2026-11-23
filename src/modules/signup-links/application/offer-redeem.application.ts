import { Injectable } from '@nestjs/common';
import { CurrentUserService } from '../../identity/services/current-user.service';
import { hasRole } from '../../identity/services/role-rank';
import { REDEMPTION_SOURCES, RedeemSubject, SignupRedemption } from '../domain/signup-links.types';
import { OfferRedemptionService } from '../services/offer-redemption.service';
import { SignupLinkViewMapper } from '../services/signup-link-view.mapper';
import { RedeemedOfferView } from '../validation/signup-links.schemas';

type CurrentUser = Awaited<ReturnType<CurrentUserService['require']>>;

@Injectable()
export class OfferRedeemApplication {
    public constructor(
        private readonly currentUser: CurrentUserService,
        private readonly redemption: OfferRedemptionService,
        private readonly mapper: SignupLinkViewMapper
    ) {}

    public async redeem(token: string, ip: string | null): Promise<RedeemedOfferView> {
        const user: CurrentUser = await this.currentUser.require();
        const subject: RedeemSubject = {
            companyId: user.companyId,
            userId: user.id,
            email: user.email,
            emailVerified: user.emailVerifiedAt !== null,
            isOwner: hasRole(user.role, 'owner'),
            ip
        };
        const redemption: SignupRedemption = await this.redemption.redeem(token, subject, REDEMPTION_SOURCES.existingAccount);
        return this.mapper.toRedeemedView(redemption);
    }
}
