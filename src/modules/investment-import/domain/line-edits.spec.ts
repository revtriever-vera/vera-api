import { describe, expect, it } from 'vitest';
import { StoredLine } from './investment-import.types';
import { applyEdits } from './line-edits';

const LINE: StoredLine = {
    lineId: 'L1',
    lineNumber: 1,
    kind: 'buy',
    incomeKind: null,
    direction: 'credit',
    tradeDate: '2026-01-10',
    ticker: 'ITUB4',
    quantity: '10',
    unitPrice: '5',
    grossMinor: 5000,
    currency: 'BRL',
    sourceRef: 'b3:x:1',
    check: null
};

describe('applyEdits', () => {
    it('keeps the line as read without edits', () => {
        expect(applyEdits([LINE], [])[0]).toEqual({
            line: LINE,
            assetId: null,
            feesMinor: 0,
            skip: false,
            repriced: false,
            positionMode: null
        });
    });

    it('applies corrections and marks a repriced line', () => {
        const [edited] = applyEdits([LINE], [{ lineId: 'L1', quantity: '4', feesMinor: 12, skip: true, positionMode: 'history_only' }]);

        expect(edited).toMatchObject({
            line: { quantity: '4', unitPrice: '5' },
            feesMinor: 12,
            skip: true,
            repriced: true,
            positionMode: 'history_only'
        });
    });

    it('corrigir quantidade, preço ou data limpa o check do modelo; outras edições não', () => {
        const flagged: StoredLine = { ...LINE, check: 'amount_mismatch' };

        expect(applyEdits([flagged], [{ lineId: 'L1', unitPrice: '6' }])[0]?.line.check).toBeNull();
        expect(applyEdits([flagged], [{ lineId: 'L1', tradeDate: '2026-01-11' }])[0]?.line.check).toBeNull();
        expect(applyEdits([flagged], [{ lineId: 'L1', feesMinor: 3 }])[0]?.line.check).toBe('amount_mismatch');
        expect(applyEdits([flagged], [])[0]?.line.check).toBe('amount_mismatch');
    });

    it('refuses an unknown or repeated line', () => {
        expect(() => applyEdits([LINE], [{ lineId: 'L9' }])).toThrowError('import.invalid_edit');
        expect(() => applyEdits([LINE], [{ lineId: 'L1' }, { lineId: 'L1' }])).toThrowError('import.invalid_edit');
    });
});
