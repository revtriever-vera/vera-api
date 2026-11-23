import { describe, expect, it } from 'vitest';
import { isPremiumProductRef, priceDescriptionOf } from './billing-price.rules';

describe('regras do preço', () => {
    it('só o produto Premium é cotado', () => {
        expect(isPremiumProductRef('vera_premium')).toBe(true);
        expect(isPremiumProductRef('outro')).toBe(false);
    });

    it('a descrição leva o mês do fim do período', () => {
        expect(priceDescriptionOf('2026-12-10')).toBe('Vera Premium — dezembro de 2026');
    });
});
