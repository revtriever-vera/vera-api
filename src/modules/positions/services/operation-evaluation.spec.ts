import { describe, expect, it } from 'vitest';
import { FAILURE_REASONS, OperationInput } from '../domain/investment-operations.types';
import { evaluateOperations } from './operation-evaluation';

function op(kind: OperationInput['kind'], quantity: string, extra: Partial<OperationInput> = {}): OperationInput {
    return {
        assetId: 'a1',
        kind,
        incomeKind: null,
        direction: null,
        tradeDate: '2026-01-10',
        settlementDate: null,
        lineNumber: 1,
        quantity,
        unitPrice: '10',
        grossMinor: 0,
        feesMinor: 0,
        withheldTaxMinor: null,
        currency: 'BRL',
        fxRate: null,
        grossBrlMinor: null,
        dayTrade: false,
        historyOnly: false,
        sourceRef: 'ref',
        ...extra
    };
}

const HELD = { quantity: '300', averagePrice: '30' };

describe('evaluateOperations', () => {
    it('turns a credited split into a factor from the position', () => {
        const result = evaluateOperations(HELD, [op('split', '300', { direction: 'credit' })]);

        expect(result.failures).toEqual([]);
        expect(result.resolved[0]?.effective.quantity).toBe('2');
        expect(result.resolved[0]?.raw.quantity).toBe('300');
        expect(result.balance).toEqual({ quantity: '600', averagePrice: '15' });
    });

    it('nets a debit and a credit of the same reverse split into one factor', () => {
        const result = evaluateOperations({ quantity: '1000', averagePrice: '1' }, [
            op('reverse_split', '1000', { direction: 'debit', lineNumber: 1 }),
            op('reverse_split', '100', { direction: 'credit', lineNumber: 2 })
        ]);

        expect(result.failures).toEqual([]);
        expect(result.resolved.map((item) => item.effective.quantity)).toEqual(['10', '1']);
        expect(result.balance).toEqual({ quantity: '100', averagePrice: '10' });
    });

    it('fails a split with no position or with the wrong direction', () => {
        expect(evaluateOperations(null, [op('split', '10', { direction: 'credit' })]).failures[0]?.reason).toBe(
            FAILURE_REASONS.eventFactor
        );
        expect(evaluateOperations(HELD, [op('split', '10', { direction: 'debit' })]).failures[0]?.reason).toBe(FAILURE_REASONS.eventFactor);
        expect(evaluateOperations(HELD, [op('reverse_split', '10', { direction: 'credit' })]).failures[0]?.reason).toBe(
            FAILURE_REASONS.eventFactor
        );
    });

    it('reports every sale that exceeds the position and keeps going', () => {
        const result = evaluateOperations(null, [
            op('buy', '10', { lineNumber: 1 }),
            op('sell', '20', { lineNumber: 2 }),
            op('buy', '5', { lineNumber: 3, tradeDate: '2026-01-11' })
        ]);

        expect(result.failures).toEqual([{ lineNumber: 2, tradeDate: '2026-01-10', reason: FAILURE_REASONS.sellExceedsPosition }]);
        expect(result.balance?.quantity).toBe('15');
    });

    it('records but does not apply an operation marked history only', () => {
        const result = evaluateOperations(HELD, [op('buy', '100', { historyOnly: true })]);

        expect(result.resolved).toHaveLength(1);
        expect(result.balance).toEqual(HELD);
    });
});
