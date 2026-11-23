import { describe, expect, it } from 'vitest';
import { discountedPriceOf, discountPercentOf } from './billing-offer-price.rules';
import { cardTrialDatesOf, resumableUntilOf } from './billing-trial.rules';
import { BillingSubscription } from './billing.types';

const SAO_PAULO: string = 'America/Sao_Paulo';

function subscription(overrides: Partial<BillingSubscription>): BillingSubscription {
    return {
        id: 'sub-1',
        companyId: 'company-1',
        engine: 'fake',
        status: 'canceled',
        engineSubscriptionId: 'e-sub-1',
        engineCustomerId: null,
        planId: 'plan',
        paymentMethod: 'card',
        firstChargeDate: null,
        chargeDay: null,
        paidThrough: null,
        firstPaidAt: null,
        cancelRequestedAt: null,
        canceledAt: null,
        cardBrand: null,
        cardLast4: null,
        trialEndsAt: null,
        trialStartedAt: null,
        createdAt: new Date('2026-11-01T00:00:00Z'),
        updatedAt: new Date('2026-11-01T00:00:00Z'),
        ...overrides
    };
}

describe('cardTrialDatesOf', () => {
    it('soma os dias de hoje e fixa o fim na meia-noite local da data da primeira cobrança', () => {
        const dates = cardTrialDatesOf(new Date('2026-11-10T01:30:00Z'), 14, SAO_PAULO);

        expect(dates.firstChargeDate).toBe('2026-11-23');
        expect(dates.trialEndsAt.toISOString()).toBe('2026-11-23T03:00:00.000Z');
    });

    it('usa o fuso da company: o mesmo instante cai em outro dia em outro fuso', () => {
        const instant: Date = new Date('2026-11-10T23:30:00Z');

        expect(cardTrialDatesOf(instant, 7, SAO_PAULO).firstChargeDate).toBe('2026-11-17');
        expect(cardTrialDatesOf(instant, 7, 'Asia/Tokyo').firstChargeDate).toBe('2026-11-18');
    });
});

describe('resumableUntilOf', () => {
    const TRIAL_END: Date = new Date('2026-11-23T03:00:00Z');

    it('cancelada com ciclo pago vale até o paidThrough', () => {
        const paidThrough: Date = new Date('2026-12-01T00:00:00Z');

        expect(resumableUntilOf(subscription({ paidThrough, firstPaidAt: new Date('2026-11-01T00:00:00Z') }))).toEqual(paidThrough);
    });

    it('cancelada no teste com o cartão confirmado vale até trialEndsAt', () => {
        expect(resumableUntilOf(subscription({ trialEndsAt: TRIAL_END, trialStartedAt: new Date('2026-11-10T00:00:00Z') }))).toEqual(
            TRIAL_END
        );
    });

    it('não reativa cartão nunca confirmado, assinatura ativa ou ausente', () => {
        expect(resumableUntilOf(subscription({ trialEndsAt: TRIAL_END }))).toBeNull();
        expect(resumableUntilOf(subscription({ status: 'active', trialEndsAt: TRIAL_END, trialStartedAt: new Date() }))).toBeNull();
        expect(resumableUntilOf(null)).toBeNull();
    });
});

describe('discountedPriceOf', () => {
    const RULES = [
        { percent: 50, fromCycle: 1, toCycle: 3 },
        { percent: 20, fromCycle: 4, toCycle: 6 }
    ];

    it('aplica a primeira regra que cobre o ciclo e arredonda ao centavo', () => {
        expect(discountedPriceOf(1490, RULES, 1)).toBe(745);
        expect(discountedPriceOf(1499, RULES, 3)).toBe(750);
        expect(discountedPriceOf(1490, RULES, 4)).toBe(1192);
    });

    it('sem regra para o ciclo cobra o preço cheio', () => {
        expect(discountPercentOf(RULES, 7)).toBe(0);
        expect(discountedPriceOf(1490, RULES, 7)).toBe(1490);
        expect(discountedPriceOf(1490, [], 1)).toBe(1490);
    });
});
