import { SignupLinkInvalidOfferError } from '../signup-links.errors';
import { DiscountRule, LinkOfferInput, SIGNUP_LINK_LIMITS, TRIAL_KINDS } from '../signup-links.types';

const DAY_MS: number = 24 * 60 * 60 * 1000;

export class SignupLinkOfferValidation {
    public static assertValid(offer: LinkOfferInput, now: Date): void {
        SignupLinkOfferValidation.assertTrial(offer);
        SignupLinkOfferValidation.assertRules(offer.rules);
        SignupLinkOfferValidation.assertExpiry(offer, now);
        SignupLinkOfferValidation.assertNoCardBounded(offer, now);
    }

    private static assertTrial(offer: LinkOfferInput): void {
        const { kind, days } = offer.trial;
        if (kind === TRIAL_KINDS.none) {
            SignupLinkOfferValidation.require(days === null, 'trial_days_without_trial');
            return;
        }
        const valid: boolean =
            days !== null && Number.isInteger(days) && days >= SIGNUP_LINK_LIMITS.minTrialDays && days <= SIGNUP_LINK_LIMITS.maxTrialDays;
        SignupLinkOfferValidation.require(valid, 'trial_days_out_of_range');
    }

    private static assertRules(rules: readonly DiscountRule[]): void {
        SignupLinkOfferValidation.require(rules.length <= SIGNUP_LINK_LIMITS.maxRules, 'too_many_rules');
        for (const rule of rules) {
            const valid: boolean =
                Number.isInteger(rule.percent) &&
                rule.percent >= SIGNUP_LINK_LIMITS.minPercent &&
                rule.percent <= SIGNUP_LINK_LIMITS.maxPercent &&
                Number.isInteger(rule.fromCycle) &&
                Number.isInteger(rule.toCycle) &&
                rule.fromCycle >= 1 &&
                rule.toCycle >= rule.fromCycle;
            SignupLinkOfferValidation.require(valid, 'rule_out_of_range');
        }
    }

    private static assertExpiry(offer: LinkOfferInput, now: Date): void {
        SignupLinkOfferValidation.require(offer.expiresAt === null || offer.expiresAt.getTime() > now.getTime(), 'expires_in_the_past');
    }

    private static assertNoCardBounded(offer: LinkOfferInput, now: Date): void {
        if (offer.trial.kind !== TRIAL_KINDS.noCard) {
            return;
        }
        SignupLinkOfferValidation.require(offer.maxUses !== null, 'no_card_requires_max_uses');
        SignupLinkOfferValidation.require(offer.expiresAt !== null, 'no_card_requires_expiry');
        const horizon: number = now.getTime() + SIGNUP_LINK_LIMITS.noCardMaxValidityDays * DAY_MS;
        SignupLinkOfferValidation.require((offer.expiresAt?.getTime() ?? 0) <= horizon, 'no_card_expiry_too_far');
    }

    private static require(condition: boolean, reason: string): void {
        if (!condition) {
            throw new SignupLinkInvalidOfferError(reason);
        }
    }
}
