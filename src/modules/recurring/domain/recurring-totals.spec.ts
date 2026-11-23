import { describe, expect, it } from 'vitest';
import { computeTotals, isToReview } from './recurring-totals';
import { RecurringSeriesRecord } from './recurring-series.types';

type Item = Pick<RecurringSeriesRecord, 'cadence' | 'kind' | 'status' | 'typicalAmountMinor' | 'snoozedUntil'>;

function item(overrides: Partial<Item>): Item {
    return { cadence: 'monthly', kind: 'subscription', status: 'confirmed', typicalAmountMinor: 5590, snoozedUntil: null, ...overrides };
}

const TODAY: string = '2026-11-23';

describe('computeTotals', () => {
    it('soma só as confirmadas, por mês, por ano e por tipo', () => {
        const totals = computeTotals(
            [
                item({}),
                item({ kind: 'bill', typicalAmountMinor: 18200 }),
                item({ kind: 'other', cadence: 'annual', typicalAmountMinor: 23900 }),
                item({ status: 'stopped' }),
                item({ status: 'dismissed' })
            ],
            TODAY
        );

        expect(totals.byKind).toEqual({ subscription: 5590, bill: 18200, other: 1992 });
        expect(totals.monthlyMinor).toBe(25782);
        expect(totals.yearlyMinor).toBe(25782 * 12);
    });

    it('as sugestões ficam ao lado e as adiadas não contam', () => {
        const totals = computeTotals(
            [
                item({ status: 'suggested', typicalAmountMinor: 3000 }),
                item({ status: 'suggested', cadence: 'quarterly', typicalAmountMinor: 6000 }),
                item({ status: 'suggested', typicalAmountMinor: 9999, snoozedUntil: '2026-12-01' })
            ],
            TODAY
        );

        expect(totals.monthlyMinor).toBe(0);
        expect(totals.suggestions).toEqual({ count: 2, monthlyMinor: 5000 });
    });
});

describe('isToReview', () => {
    it('a sugestão adiada volta no dia em que o adiamento acaba', () => {
        expect(isToReview({ status: 'suggested', snoozedUntil: TODAY }, TODAY)).toBe(true);
        expect(isToReview({ status: 'suggested', snoozedUntil: '2026-11-24' }, TODAY)).toBe(false);
        expect(isToReview({ status: 'confirmed', snoozedUntil: null }, TODAY)).toBe(false);
    });
});
