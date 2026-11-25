import { describe, expect, it } from 'vitest';
import { StoredLine } from '../investment-import.types';
import { foreignCheckOf } from './foreign-checks';

const LINE: StoredLine = {
    lineId: 'L1',
    lineNumber: 1,
    kind: 'buy',
    incomeKind: null,
    direction: 'credit',
    tradeDate: '2026-08-05',
    ticker: 'AAPL',
    quantity: '5',
    unitPrice: '200',
    grossMinor: 100000,
    feesMinor: 0,
    currency: 'USD',
    market: 'US',
    sourceRef: 'model:x:1',
    check: null,
    dollar: { fxRate: '5', grossBrlMinor: 500000, withheldTaxMinor: null, closingQuantity: '15' }
};

describe('foreignCheckOf', () => {
    it('accepts the line when the position after the import matches the summary', () => {
        expect(foreignCheckOf(LINE, { afterQuantity: '15.0000', latestTradeDate: '2026-07-31' })).toBeNull();
    });

    it('asks to check when the position after the import differs from the summary', () => {
        expect(foreignCheckOf(LINE, { afterQuantity: '5', latestTradeDate: null })).toBe('position_mismatch');
    });

    it('warns when the asset already has trades after this line date', () => {
        expect(foreignCheckOf(LINE, { afterQuantity: '15', latestTradeDate: '2026-09-22' })).toBe('out_of_order');
    });

    it('does not judge lines of other sources, income lines or lines without a closing quantity', () => {
        const { dollar: _dollar, ...plain } = LINE;
        expect(foreignCheckOf(plain, { afterQuantity: '1', latestTradeDate: '2027-01-01' })).toBeNull();
        expect(foreignCheckOf({ ...LINE, kind: 'income' }, { afterQuantity: '1', latestTradeDate: null })).toBeNull();
        expect(
            foreignCheckOf({ ...LINE, dollar: { ...LINE.dollar!, closingQuantity: null } }, { afterQuantity: '1', latestTradeDate: null })
        ).toBeNull();
    });
});
