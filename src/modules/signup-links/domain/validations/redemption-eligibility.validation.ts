import { RedeemEmailUnverifiedError, RedeemNotEligibleError, RedeemNotOwnerError } from '../signup-links.errors';
import { AccountHistory, REDEEM_REJECTIONS, RedeemSubject, SignupLink, TRIAL_KINDS } from '../signup-links.types';

export class RedemptionEligibilityValidation {
    public static assertEligible(subject: RedeemSubject, history: AccountHistory, link: SignupLink): void {
        if (!subject.isOwner) {
            throw new RedeemNotOwnerError();
        }
        if (history.isPlatform) {
            throw new RedeemNotEligibleError(REDEEM_REJECTIONS.platformAccount);
        }
        if (history.alreadyRedeemed) {
            throw new RedeemNotEligibleError(REDEEM_REJECTIONS.alreadyRedeemed);
        }
        if (history.everPremium) {
            throw new RedeemNotEligibleError(REDEEM_REJECTIONS.alreadyPaid);
        }
        if (history.trialUsed) {
            throw new RedeemNotEligibleError(REDEEM_REJECTIONS.trialUsed);
        }
        if (link.trialKind === TRIAL_KINDS.noCard && !subject.emailVerified) {
            throw new RedeemEmailUnverifiedError();
        }
    }

    public static marksEmail(subject: RedeemSubject, link: SignupLink): boolean {
        return link.trialKind !== TRIAL_KINDS.none && subject.emailVerified;
    }
}
