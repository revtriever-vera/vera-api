import { describe, expect, it } from 'vitest';
import { compareAnswers } from './extract-compare';

const BUY: Record<string, unknown> = {
    kind: 'buy',
    tradeDate: '2026-08-05',
    ticker: 'AAPL',
    quantity: '5',
    unitPrice: '200.00',
    grossMinor: 100000
};
const INCOME: Record<string, unknown> = {
    kind: 'income',
    tradeDate: '2026-08-14',
    ticker: 'AAPL',
    quantity: '0',
    unitPrice: null,
    grossMinor: 240
};

const EXPECTED: Parameters<typeof compareAnswers>[1] = {
    periodStart: '2026-08-01',
    periodEnd: '2026-08-31',
    operations: [BUY, INCOME],
    positions: [{ block: 'equities', symbol: 'AAPL', quantity: '15' }],
    taxWithholdings: [{ tradeDate: '2026-08-14', ticker: 'AAPL', amountMinor: 72 }],
    cashMovements: [{ tradeDate: '2026-08-20', direction: 'debit', amountMinor: 50000 }]
};

describe('compareAnswers', () => {
    it('passes every section when the answer equals the reference, even with other number formats', () => {
        const actual = {
            ...EXPECTED,
            operations: [{ ...BUY, unitPrice: '200', ticker: 'aapl' }, INCOME]
        };
        const results = compareAnswers(
            ['period', 'operations', 'income', 'positions', 'taxWithholdings', 'cashMovements'],
            EXPECTED,
            actual
        );
        expect(results.every((result) => result.passed)).toBe(true);
    });

    it('fails the tax section when the withheld amount is wrong and counts missing and extra', () => {
        const actual = { ...EXPECTED, taxWithholdings: [{ tradeDate: '2026-08-14', ticker: 'AAPL', amountMinor: 90 }] };
        const [result] = compareAnswers(['taxWithholdings'], EXPECTED, actual);
        expect(result).toMatchObject({ passed: false, missing: 1, extra: 1 });
    });

    it('fails the period when it is missing in the answer', () => {
        const [result] = compareAnswers(['period'], EXPECTED, { operations: [] });
        expect(result?.passed).toBe(false);
    });
});
