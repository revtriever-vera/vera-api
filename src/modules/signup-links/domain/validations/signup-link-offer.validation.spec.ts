import { describe, expect, it } from 'vitest';
import { SignupLinkInvalidOfferError } from '../signup-links.errors';
import { DiscountRule, LinkOfferInput, TRIAL_KINDS } from '../signup-links.types';
import { SignupLinkOfferValidation } from './signup-link-offer.validation';

const NOW: Date = new Date('2026-11-23T12:00:00.000Z');
const DAY_MS: number = 24 * 60 * 60 * 1000;

function offer(overrides: Partial<LinkOfferInput> = {}): LinkOfferInput {
    return { label: 'Parceria', trial: { kind: TRIAL_KINDS.none, days: null }, rules: [], maxUses: null, expiresAt: null, ...overrides };
}

function reasonOf(input: LinkOfferInput): string | null {
    try {
        SignupLinkOfferValidation.assertValid(input, NOW);
        return null;
    } catch (error: unknown) {
        return error instanceof SignupLinkInvalidOfferError ? (error.meta?.['reason'] as string) : 'other';
    }
}

describe('SignupLinkOfferValidation', () => {
    it('aceita uma oferta sem teste e sem régua, sem limite e sem validade', () => {
        expect(reasonOf(offer())).toBeNull();
    });

    it('sem teste não leva dias', () => {
        expect(reasonOf(offer({ trial: { kind: TRIAL_KINDS.none, days: 7 } }))).toBe('trial_days_without_trial');
    });

    it.each([0, 61, 1.5])('recusa teste de %s dias', (days: number) => {
        expect(reasonOf(offer({ trial: { kind: TRIAL_KINDS.card, days } }))).toBe('trial_days_out_of_range');
    });

    it('recusa teste sem os dias e aceita de 1 a 60', () => {
        expect(reasonOf(offer({ trial: { kind: TRIAL_KINDS.card, days: null } }))).toBe('trial_days_out_of_range');
        expect(reasonOf(offer({ trial: { kind: TRIAL_KINDS.card, days: 1 } }))).toBeNull();
        expect(reasonOf(offer({ trial: { kind: TRIAL_KINDS.card, days: 60 } }))).toBeNull();
    });

    it('a régua aceita de 1% a 90% e até 20 regras', () => {
        const rule: DiscountRule = { percent: 90, fromCycle: 1, toCycle: 1 };

        expect(reasonOf(offer({ rules: Array.from({ length: 20 }, (): DiscountRule => rule) }))).toBeNull();
        expect(reasonOf(offer({ rules: Array.from({ length: 21 }, (): DiscountRule => rule) }))).toBe('too_many_rules');
    });

    it.each([
        { percent: 0, fromCycle: 1, toCycle: 1 },
        { percent: 91, fromCycle: 1, toCycle: 1 },
        { percent: 50, fromCycle: 0, toCycle: 1 },
        { percent: 50, fromCycle: 4, toCycle: 3 }
    ])('recusa a regra %o', (rule: DiscountRule) => {
        expect(reasonOf(offer({ rules: [rule] }))).toBe('rule_out_of_range');
    });

    it('recusa validade no passado', () => {
        expect(reasonOf(offer({ expiresAt: new Date(NOW.getTime() - 1) }))).toBe('expires_in_the_past');
    });

    it('teste sem cartão exige limite de usos e validade de até 90 dias', () => {
        const noCard: LinkOfferInput['trial'] = { kind: TRIAL_KINDS.noCard, days: 14 };
        const inDays = (days: number): Date => new Date(NOW.getTime() + days * DAY_MS);

        expect(reasonOf(offer({ trial: noCard, expiresAt: inDays(30) }))).toBe('no_card_requires_max_uses');
        expect(reasonOf(offer({ trial: noCard, maxUses: 10 }))).toBe('no_card_requires_expiry');
        expect(reasonOf(offer({ trial: noCard, maxUses: 10, expiresAt: inDays(91) }))).toBe('no_card_expiry_too_far');
        expect(reasonOf(offer({ trial: noCard, maxUses: 10, expiresAt: inDays(90) }))).toBeNull();
    });

    it('teste com cartão não exige limite nem validade', () => {
        expect(reasonOf(offer({ trial: { kind: TRIAL_KINDS.card, days: 14 } }))).toBeNull();
    });
});
