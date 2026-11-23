import { describe, expect, it } from 'vitest';
import { discountPercentOf, isPremiumProductRef, priceDescriptionOf, resolvePrice } from './billing-price.rules';

describe('regras do preço', () => {
    it('só o produto Premium é cotado', () => {
        expect(isPremiumProductRef('vera_premium')).toBe(true);
        expect(isPremiumProductRef('outro')).toBe(false);
    });

    it('a descrição leva o mês do fim do período', () => {
        expect(priceDescriptionOf('2026-12-10')).toBe('Vera Premium — dezembro de 2026');
    });

    it('a descrição diz o desconto do ciclo', () => {
        expect(priceDescriptionOf('2026-12-10', 50)).toBe('Vera Premium — dezembro de 2026 (50% de desconto)');
    });

    describe('régua por ciclo', () => {
        const rules = [
            { percent: 50, fromCycle: 1, toCycle: 3 },
            { percent: 25, fromCycle: 4, toCycle: 6 }
        ];

        it('a regra do ciclo vale; fora das faixas é preço cheio', () => {
            expect(resolvePrice(1490, rules, 1)).toEqual({ amountCents: 745, percent: 50 });
            expect(resolvePrice(1490, rules, 3)).toEqual({ amountCents: 745, percent: 50 });
            expect(resolvePrice(1490, rules, 4)).toEqual({ amountCents: 1118, percent: 25 });
            expect(resolvePrice(1490, rules, 7)).toEqual({ amountCents: 1490, percent: null });
        });

        it('a primeira regra que casa ganha', () => {
            const overlapping = [
                { percent: 10, fromCycle: 1, toCycle: 5 },
                { percent: 90, fromCycle: 2, toCycle: 3 }
            ];
            expect(discountPercentOf(overlapping, 2)).toBe(10);
        });

        it('sem régua o preço é cheio', () => {
            expect(resolvePrice(1490, [], 1)).toEqual({ amountCents: 1490, percent: null });
        });
    });
});
