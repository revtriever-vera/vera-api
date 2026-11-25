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
