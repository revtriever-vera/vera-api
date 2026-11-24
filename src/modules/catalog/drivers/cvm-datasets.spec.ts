import { describe, expect, it } from 'vitest';
import { informeMonths, recentMonths, recentYears } from './cvm-datasets';

describe('recentYears', () => {
    it('lists the current year and the previous ones', () => {
        expect(recentYears('2026-11-23', 2)).toEqual(['2026', '2025']);
    });
});

describe('recentMonths', () => {
    it('lists the current month and the three before it', () => {
        expect(recentMonths('2026-11-23')).toEqual(['202611', '202610', '202609', '202608']);
    });

    it('crosses the year boundary', () => {
        expect(recentMonths('2027-02-03')).toEqual(['202702', '202701', '202612', '202611']);
    });
});

describe('informeMonths', () => {
    it('reads only the current month after the fifth business day', () => {
        expect(informeMonths('2026-11-09')).toEqual(['202611']);
    });

    it('adds the previous month up to the fifth business day, weekends not counted', () => {
        expect(informeMonths('2026-11-06')).toEqual(['202611', '202610']);
        expect(informeMonths('2026-11-09')).toEqual(['202611']);
        expect(informeMonths('2026-10-07')).toEqual(['202610', '202609']);
        expect(informeMonths('2026-10-08')).toEqual(['202610']);
    });

    it('counts a weekend start of the month as no business day yet', () => {
        expect(informeMonths('2026-11-01')).toEqual(['202611', '202610']);
        expect(informeMonths('2027-01-01')).toEqual(['202701', '202612']);
    });
});
