import { describe, expect, it } from 'vitest';
import { EditedLine, StoredLine } from '../domain/investment-import.types';
import { operationOf } from './import-operation.builder';

const LINE: StoredLine = {
    lineId: 'L1',
    lineNumber: 1,
    kind: 'buy',
    incomeKind: null,
    direction: 'credit',
    tradeDate: '2026-01-10',
    ticker: 'ITUB4',
    quantity: '10',
    unitPrice: '5.5',
    grossMinor: 5500,
    feesMinor: 0,
    currency: 'BRL',
    market: 'B3',
    sourceRef: 'b3:x:1',
    check: null
};

function edited(extra: Partial<EditedLine> = {}, line: Partial<StoredLine> = {}): EditedLine {
    return { line: { ...LINE, ...line }, assetId: null, feesMinor: 0, skip: false, repriced: false, positionMode: null, ...extra };
}

describe('operationOf', () => {
    it('keeps the gross of the report unless the line was repriced', () => {
        expect(operationOf(edited(), 'a1').grossMinor).toBe(5500);
        expect(operationOf(edited({ repriced: true }, { quantity: '4' }), 'a1').grossMinor).toBe(2200);
    });

    it('sends the direction only for split and reverse split, and history only from the mode', () => {
        expect(operationOf(edited(), 'a1').direction).toBeNull();
        expect(operationOf(edited({}, { kind: 'split', direction: 'debit' }), 'a1').direction).toBe('debit');
        expect(operationOf(edited({ positionMode: 'history_only' }), 'a1').historyOnly).toBe(true);
    });
});

describe('operationOf with dollar facts', () => {
    const DOLLAR: StoredLine['dollar'] = { fxRate: '5.40', grossBrlMinor: 1026000, withheldTaxMinor: 72, closingQuantity: null };

    it('sends the rate, the BRL gross and the withheld tax to the operation', () => {
        const input: ReturnType<typeof operationOf> = operationOf(
            edited({}, { currency: 'USD', grossMinor: 190000, dollar: DOLLAR }),
            'a1'
        );
        expect(input).toMatchObject({ fxRate: '5.40', grossBrlMinor: 1026000, withheldTaxMinor: 72, currency: 'USD' });
    });

    it('converts the BRL gross again by the same rate when the line was repriced', () => {
        const input: ReturnType<typeof operationOf> = operationOf(
            edited({ repriced: true }, { currency: 'USD', quantity: '5', unitPrice: '200', dollar: DOLLAR }),
            'a1'
        );
        expect(input.grossBrlMinor).toBe(540000);
    });

    it('leaves the foreign fields empty for other sources', () => {
        expect(operationOf(edited(), 'a1')).toMatchObject({ fxRate: null, grossBrlMinor: null, withheldTaxMinor: null });
    });
});
