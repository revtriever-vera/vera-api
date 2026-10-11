import { describe, expect, it } from 'vitest';
import { convertMinor } from './currency-conversion';
import { SourceRate } from './portfolio.types';

const PTAX: SourceRate = { brlPerUnit: '5.42', date: '2026-10-09', source: 'bcb-ptax' };

describe('currency conversion', () => {
    it('multiplies USD by the rate to reach BRL', () => {
        expect(convertMinor(2_000_000, 'USD', 'BRL', PTAX)).toEqual({ valueMinor: 10_840_000, missingRate: false });
    });

    it('divides BRL by the rate to reach USD', () => {
        expect(convertMinor(10_840_000, 'BRL', 'USD', PTAX)).toEqual({ valueMinor: 2_000_000, missingRate: false });
    });

    it('rounds the converted amount half up', () => {
        expect(convertMinor(100, 'BRL', 'USD', { ...PTAX, brlPerUnit: '4' }).valueMinor).toBe(25);
        expect(convertMinor(1, 'BRL', 'USD', { ...PTAX, brlPerUnit: '2' }).valueMinor).toBe(1);
    });

    it('returns the same amount when both currencies match, even without a rate', () => {
        expect(convertMinor(123, 'USD', 'USD', null)).toEqual({ valueMinor: 123, missingRate: false });
    });

    it('flags a missing rate when the base is USD and the rate is absent', () => {
        expect(convertMinor(10_840_000, 'BRL', 'USD', null)).toEqual({ valueMinor: 0, missingRate: true });
    });

    it('treats a zero rate as missing', () => {
        expect(convertMinor(100, 'USD', 'BRL', { ...PTAX, brlPerUnit: '0' })).toEqual({ valueMinor: 0, missingRate: true });
    });

    it('does not need a rate for a zero amount', () => {
        expect(convertMinor(0, 'USD', 'BRL', null)).toEqual({ valueMinor: 0, missingRate: false });
    });
});
