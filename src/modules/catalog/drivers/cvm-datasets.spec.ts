import { describe, expect, it } from 'vitest';
import { recentMonths, recentYears } from './cvm-datasets';

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
