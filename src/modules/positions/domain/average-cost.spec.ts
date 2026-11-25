import { describe, expect, it } from 'vitest';
import { affectsPosition, applyOperations, AverageCostResult, sortOperations } from './average-cost';
import { BalanceState, CostOperation, OperationKind } from './investment-operations.types';

function op(kind: OperationKind, quantity: string, unitPrice: string, extra: Partial<CostOperation> = {}): CostOperation {
    return { kind, quantity, unitPrice, tradeDate: '2026-01-10', lineNumber: 1, feesMinor: 0, currency: 'BRL', dayTrade: false, ...extra };
}

function balanceOf(current: BalanceState | null, operations: CostOperation[]): BalanceState | null {
    const result: AverageCostResult = applyOperations(current, operations);
    if (!result.ok) {
        throw new Error('unexpected error');
    }
    return result.balance;
}

describe('applyOperations', () => {
    it('opens a position with a simple buy', () => {
        expect(balanceOf(null, [op('buy', '10', '20')])).toEqual({ quantity: '10', averagePrice: '20' });
    });

    it('includes the fees of each line in the cost of two buys', () => {
        const buys: CostOperation[] = [op('buy', '10', '10', { feesMinor: 100 }), op('buy', '10', '20', { feesMinor: 300, lineNumber: 2 })];

        expect(balanceOf(null, buys)).toEqual({ quantity: '20', averagePrice: '15.2' });
    });

    it('keeps the average price on a partial sale', () => {
        const after: BalanceState | null = balanceOf({ quantity: '100', averagePrice: '12.5' }, [
            op('sell', '40', '30', { feesMinor: 500 })
        ]);

        expect(after).toEqual({ quantity: '60', averagePrice: '12.5' });
    });

    it('zeroes and drops the position on a full sale', () => {
        expect(balanceOf({ quantity: '5', averagePrice: '9' }, [op('sell', '5', '10')])).toBeNull();
    });

    it('rejects a sale larger than the position with the offending line', () => {
        const sale: CostOperation = op('sell', '6', '10', { lineNumber: 7 });

        expect(applyOperations({ quantity: '5', averagePrice: '9' }, [sale])).toEqual({
            ok: false,
            error: { code: 'sell_exceeds_position', operation: sale }
        });
        expect(applyOperations(null, [sale]).ok).toBe(false);
    });

    it('applies a 1:2 split keeping the total cost', () => {
        expect(balanceOf({ quantity: '100', averagePrice: '10' }, [op('split', '2', '0')])).toEqual({ quantity: '200', averagePrice: '5' });
    });

    it('applies a 10:1 reverse split keeping the total cost', () => {
        expect(balanceOf({ quantity: '100', averagePrice: '10' }, [op('reverse_split', '10', '0')])).toEqual({
            quantity: '10',
            averagePrice: '100'
        });
    });

    it('applies a 10% bonus keeping the total cost', () => {
        expect(balanceOf({ quantity: '100', averagePrice: '11' }, [op('bonus', '10', '0')])).toEqual({
            quantity: '110',
            averagePrice: '10'
        });
    });

    it('leaves the position alone on day trade, income and transfer', () => {
        const current: BalanceState = { quantity: '10', averagePrice: '5' };
        const ignored: CostOperation[] = [
            op('buy', '100', '9', { dayTrade: true }),
            op('sell', '100', '9', { dayTrade: true, lineNumber: 2 }),
            op('income', '0', '1', { lineNumber: 3 }),
            op('transfer', '10', '0', { lineNumber: 4 })
        ];

        expect(balanceOf(current, ignored)).toEqual(current);
    });

    it('orders by date and, on the same day, by the order of the note', () => {
        const unordered: CostOperation[] = [
            op('sell', '10', '9', { tradeDate: '2026-01-12' }),
            op('buy', '5', '4', { tradeDate: '2026-01-11', lineNumber: 2 }),
            op('buy', '5', '6', { tradeDate: '2026-01-11', lineNumber: 1 }),
            op('buy', '10', '5', { tradeDate: '2026-01-10' })
        ];

        expect(balanceOf(null, unordered)).toEqual({ quantity: '10', averagePrice: '5' });
        expect(balanceOf(null, [op('sell', '10', '9', { lineNumber: 2 }), op('buy', '10', '5', { lineNumber: 1 })])).toBeNull();
        expect(sortOperations(unordered).map((operation: CostOperation): number => operation.lineNumber)).toEqual([1, 1, 2, 1]);
    });

    it('ignores a split on a missing position and a zero quantity buy', () => {
        expect(
            balanceOf(null, [op('split', '2', '0'), op('buy', '0', '5'), op('bonus', '3', '0'), op('reverse_split', '2', '0')])
        ).toBeNull();
    });

    it('handles a position without a known price', () => {
        expect(balanceOf({ quantity: '10', averagePrice: null }, [op('buy', '10', '4')])).toEqual({ quantity: '20', averagePrice: '4' });
        expect(
            balanceOf({ quantity: '10', averagePrice: null }, [op('split', '2', '0'), op('reverse_split', '2', '0'), op('bonus', '1', '0')])
        ).toEqual({
            quantity: '11',
            averagePrice: null
        });
    });

    it('treats a zero quantity sale and a zero factor event as no-ops', () => {
        const current: BalanceState = { quantity: '10', averagePrice: '5' };

        expect(balanceOf(current, [op('sell', '0', '5'), op('split', '0', '0'), op('reverse_split', '0', '0')])).toEqual(current);
    });

    it('uses the minor unit of the currency of the fees', () => {
        expect(balanceOf(null, [op('buy', '1', '10', { feesMinor: 100, currency: 'JPY' })])).toEqual({
            quantity: '1',
            averagePrice: '110'
        });
    });

    it('rounds to the precision of the columns', () => {
        expect(balanceOf(null, [op('buy', '3', '1'), op('buy', '0.0000000001', '1', { lineNumber: 2 })])).toEqual({
            quantity: '3.0000000001',
            averagePrice: '1'
        });
        expect(balanceOf(null, [op('buy', '3', '10')])?.averagePrice).toBe('10');
        expect(balanceOf({ quantity: '3', averagePrice: '1' }, [op('buy', '3', '2')])).toEqual({ quantity: '6', averagePrice: '1.5' });
        expect(balanceOf(null, [op('buy', '3', '1', { feesMinor: 1 })])?.averagePrice).toBe('1.00333333');
    });
});

describe('affectsPosition', () => {
    it('is true for buys, sells and events, except day trade', () => {
        expect(affectsPosition({ kind: 'buy', dayTrade: false })).toBe(true);
        expect(affectsPosition({ kind: 'sell', dayTrade: true })).toBe(false);
        expect(affectsPosition({ kind: 'split', dayTrade: false })).toBe(true);
        expect(affectsPosition({ kind: 'income', dayTrade: false })).toBe(false);
        expect(affectsPosition({ kind: 'transfer', dayTrade: false })).toBe(false);
    });
});
