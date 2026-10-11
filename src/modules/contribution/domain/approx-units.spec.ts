import { describe, expect, it } from 'vitest';
import { approxUnits } from './approx-units';

describe('approxUnits', () => {
    it('rounds down to whole units for a B3 stock', () => {
        expect(approxUnits(213_607, '52.10', 'BRL', 'BRL', null, 0)).toBe('40');
        expect(approxUnits(5_718, '36.90', 'BRL', 'BRL', null, 0)).toBe('1');
    });

    it('returns "0" when the amount does not buy one unit', () => {
        expect(approxUnits(1_000, '36.90', 'BRL', 'BRL', null, 0)).toBe('0');
    });

    it('converts the base amount to the dollar by the PTAX', () => {
        expect(approxUnits(542_000, '545', 'USD', 'BRL', '5.42', 0)).toBe('1');
        expect(approxUnits(542_000, '545', 'USD', 'BRL', '5.42', 6)).toBe('1.834862');
    });

    it('converts a dollar base amount to a real priced asset', () => {
        expect(approxUnits(10_000, '50', 'BRL', 'USD', '5', 0)).toBe('10');
    });

    it('keeps the decimals accepted by the asset', () => {
        expect(approxUnits(1_000_000, '62000', 'USD', 'USD', null, 8)).toBe('0.16129032');
        expect(approxUnits(100_000, '16200', 'BRL', 'BRL', null, 2)).toBe('0.06');
    });

    it('returns null without the exchange rate or with a currency it cannot convert', () => {
        expect(approxUnits(542_000, '545', 'USD', 'BRL', null, 6)).toBeNull();
        expect(approxUnits(542_000, '545', 'EUR', 'BRL', '5.42', 6)).toBeNull();
    });

    it('returns null for a price that is not positive', () => {
        expect(approxUnits(542_000, '0', 'BRL', 'BRL', null, 0)).toBeNull();
    });
});
