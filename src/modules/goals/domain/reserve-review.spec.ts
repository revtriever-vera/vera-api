import { describe, expect, it } from 'vitest';
import { reserveBaseOf, reviewReserve, suggestedReserveMinor } from './reserve-review';

describe('reserve-review', () => {
    it('sugere N vezes a média, e nada sem média', () => {
        expect(suggestedReserveMinor(520000, 6)).toBe(3120000);
        expect(suggestedReserveMinor(null, 6)).toBeNull();
    });

    it('arredonda a sugestão para R$ 100, sem centavos soltos', () => {
        expect(suggestedReserveMinor(123456, 6)).toBe(740000);
        expect(suggestedReserveMinor(123457, 3)).toBe(370000);
    });

    it('a base é o alvo dividido pelos meses, meio para cima', () => {
        expect(reserveBaseOf(3120000, 6)).toBe(520000);
        expect(reserveBaseOf(1001, 2)).toBe(501);
    });

    it('avisa só quando a média anda mais de 10% para cima ou para baixo', () => {
        const basis = { months: 6, baseMinor: 520000 };

        expect(reviewReserve(basis, 572000)).toMatchObject({ deltaBps: 1000, shouldUpdate: false });
        expect(reviewReserve(basis, 572001)).toMatchObject({ deltaBps: 1000, shouldUpdate: false });
        expect(reviewReserve(basis, 590000)).toMatchObject({ deltaBps: 1346, shouldUpdate: true, suggestedMinor: 3540000 });
        expect(reviewReserve(basis, 400000)).toMatchObject({ deltaBps: -2308, shouldUpdate: true });
    });

    it('sem média atual não avisa', () => {
        expect(reviewReserve({ months: 3, baseMinor: 100 }, null)).toMatchObject({ deltaBps: null, shouldUpdate: false });
    });
});
