import { describe, expect, it } from 'vitest';
import { nativeValueOf, valueNative, valuePosition } from './holding-valuation';
import { SourceRate } from './portfolio.types';

const PTAX: SourceRate = { brlPerUnit: '5.42', date: '2026-10-09', source: 'bcb-ptax' };

describe('holding valuation', () => {
    it('values 2000 shares at 37.80 BRL as 7,560,000 cents', () => {
        const valued = valuePosition({ quantity: '2000', price: '37.80', nativeCurrency: 'BRL', baseCurrency: 'BRL', usdRate: PTAX });

        expect(valued).toEqual({ nativeValueMinor: 7_560_000, valueMinor: 7_560_000, missingRate: false });
    });

    it('converts 40 shares at 545 USD to BRL by the PTAX of 5.42', () => {
        const valued = valuePosition({ quantity: '40', price: '545', nativeCurrency: 'USD', baseCurrency: 'BRL', usdRate: PTAX });

        expect(valued).toEqual({ nativeValueMinor: 2_180_000, valueMinor: 11_815_600, missingRate: false });
    });

    it('values 0.45 BTC at 62000 USD', () => {
        expect(nativeValueOf('0.45', '62000', 'USD')).toBe(2_790_000);
    });

    it('does not convert when the asset currency is the base currency', () => {
        const valued = valuePosition({ quantity: '300', price: '362', nativeCurrency: 'BRL', baseCurrency: 'BRL', usdRate: null });

        expect(valued.valueMinor).toBe(10_860_000);
        expect(valued.missingRate).toBe(false);
    });

    it('rounds half a cent up', () => {
        expect(nativeValueOf('1', '0.005', 'BRL')).toBe(1);
        expect(nativeValueOf('3', '0.835', 'BRL')).toBe(251);
    });

    it('rounds half a unit up when converting', () => {
        const valued = valueNative(1, 'USD', 'BRL', { ...PTAX, brlPerUnit: '0.5' });

        expect(valued.valueMinor).toBe(1);
    });

    it('keeps the native value and zeroes the base value when the rate is missing', () => {
        const valued = valuePosition({ quantity: '10', price: '100', nativeCurrency: 'USD', baseCurrency: 'BRL', usdRate: null });

        expect(valued).toEqual({ nativeValueMinor: 100_000, valueMinor: 0, missingRate: true });
    });
});
