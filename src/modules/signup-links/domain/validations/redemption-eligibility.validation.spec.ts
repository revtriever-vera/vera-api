import { describe, expect, it } from 'vitest';
import { RedeemEmailUnverifiedError, RedeemNotEligibleError, RedeemNotOwnerError } from '../signup-links.errors';
import { AccountHistory, RedeemSubject, SignupLink } from '../signup-links.types';
import { RedemptionEligibilityValidation } from './redemption-eligibility.validation';

const NOW: Date = new Date('2026-11-23T12:00:00.000Z');

function link(overrides: Partial<SignupLink> = {}): SignupLink {
    return {
        id: 'link',
        token: 'token',
        label: 'Parceria',
        trialKind: 'none',
        trialDays: null,
        rules: [],
        maxUses: null,
        expiresAt: null,
        offerValidityDays: 30,
        redemptionCount: 0,
        trialCount: 0,
        subscriptionCount: 0,
        revokedAt: null,
        createdByUserId: null,
        createdAt: NOW,
        updatedAt: NOW,
        ...overrides
    };
}

function subject(overrides: Partial<RedeemSubject> = {}): RedeemSubject {
    return { companyId: 'c', userId: 'u', email: 'ana@example.com', emailVerified: true, isOwner: true, ip: '1.1.1.1', ...overrides };
}

function history(overrides: Partial<AccountHistory> = {}): AccountHistory {
    return { isPlatform: false, everPremium: false, trialUsed: false, alreadyRedeemed: false, ...overrides };
}

describe('RedemptionEligibilityValidation.assertEligible', () => {
    it('aceita o Dono de uma conta Free sem teste nem resgate', () => {
        expect(() => {
            RedemptionEligibilityValidation.assertEligible(subject(), history(), link());
        }).not.toThrow();
    });

    it('recusa quem não é Dono', () => {
        expect(() => {
            RedemptionEligibilityValidation.assertEligible(subject({ isOwner: false }), history(), link());
        }).toThrow(RedeemNotOwnerError);
    });

    it.each([
        ['platform_account', { isPlatform: true }],
        ['already_redeemed', { alreadyRedeemed: true }],
        ['already_paid', { everPremium: true }],
        ['trial_used', { trialUsed: true }]
    ])('recusa por %s', (reason: string, overrides: Partial<AccountHistory>) => {
        expect(() => {
            RedemptionEligibilityValidation.assertEligible(subject(), history(overrides), link());
        }).toThrow(expect.objectContaining({ code: 'signup_links.account_not_eligible', meta: { reason } }) as RedeemNotEligibleError);
    });

    it('exige e-mail verificado no teste sem cartão, mas não no com cartão nem no só desconto', () => {
        const unverified: RedeemSubject = subject({ emailVerified: false });
        expect(() => {
            RedemptionEligibilityValidation.assertEligible(unverified, history(), link({ trialKind: 'no_card', trialDays: 7 }));
        }).toThrow(RedeemEmailUnverifiedError);
        expect(() => {
            RedemptionEligibilityValidation.assertEligible(unverified, history(), link({ trialKind: 'card', trialDays: 7 }));
        }).not.toThrow();
        expect(() => {
            RedemptionEligibilityValidation.assertEligible(unverified, history(), link());
        }).not.toThrow();
    });
});

describe('RedemptionEligibilityValidation.marksEmail', () => {
    it('só marca o e-mail verificado que resgata oferta com teste', () => {
        expect(RedemptionEligibilityValidation.marksEmail(subject(), link({ trialKind: 'card', trialDays: 7 }))).toBe(true);
        expect(RedemptionEligibilityValidation.marksEmail(subject(), link())).toBe(false);
        expect(
            RedemptionEligibilityValidation.marksEmail(subject({ emailVerified: false }), link({ trialKind: 'card', trialDays: 7 }))
        ).toBe(false);
    });
});
