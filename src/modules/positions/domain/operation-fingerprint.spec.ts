import { describe, expect, it } from 'vitest';
import { OperationInput } from './investment-operations.types';
import { cleanFileName, operationFingerprint } from './operation-fingerprint';

const BASE: OperationInput = {
    assetId: 'a1',
    kind: 'buy',
    incomeKind: null,
    tradeDate: '2026-01-10',
    settlementDate: null,
    lineNumber: 1,
    quantity: '10.0',
    unitPrice: '5',
    grossMinor: 5000,
    feesMinor: 10,
    withheldTaxMinor: null,
    currency: 'BRL',
    fxRate: null,
    grossBrlMinor: null,
    dayTrade: false,
    sourceRef: 'note-1:1'
};

describe('operationFingerprint', () => {
    it('is stable across equal decimal spellings and differs by holder and source line', () => {
        expect(operationFingerprint(null, BASE)).toBe(operationFingerprint(null, { ...BASE, quantity: '10' }));
        expect(operationFingerprint(null, BASE)).not.toBe(operationFingerprint('u1', BASE));
        expect(operationFingerprint(null, BASE)).not.toBe(operationFingerprint(null, { ...BASE, sourceRef: 'note-1:2' }));
    });
});

describe('cleanFileName', () => {
    it('drops the path, control characters and excess length', () => {
        expect(cleanFileName('C:\\docs\\nota\u0000 b3.pdf')).toBe('nota b3.pdf');
        expect(cleanFileName('/tmp/x/nota.pdf')).toBe('nota.pdf');
        expect(cleanFileName('a'.repeat(400))).toHaveLength(255);
    });
});
