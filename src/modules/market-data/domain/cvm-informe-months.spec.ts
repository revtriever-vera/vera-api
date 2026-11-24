import { describe, expect, it } from 'vitest';
import { informeMonthsOf } from './cvm-informe-months';

describe('informeMonthsOf', () => {
    it('reads only the current month after the fifth business day', () => {
        expect(informeMonthsOf(new Date('2026-10-08T12:00:00Z'))).toEqual(['202610']);
    });

    it('adds the previous month through the fifth business day', () => {
        expect(informeMonthsOf(new Date('2026-10-07T12:00:00Z'))).toEqual(['202610', '202609']);
    });

    it('counts weekends as non business days', () => {
        expect(informeMonthsOf(new Date('2026-11-06T12:00:00Z'))).toEqual(['202611', '202610']);
        expect(informeMonthsOf(new Date('2026-11-09T12:00:00Z'))).toEqual(['202611']);
    });

    it('rolls January back to December of the previous year', () => {
        expect(informeMonthsOf(new Date('2027-01-04T12:00:00Z'))).toEqual(['202701', '202612']);
    });

    it('uses the date in Sao Paulo', () => {
        expect(informeMonthsOf(new Date('2026-10-01T02:00:00Z'))).toEqual(['202609']);
    });
});
