import { describe, expect, it } from 'vitest';
import { ParsedInvestmentStatement, ParsedOperation } from './investment-statement.types';
import { ignoredViewsOf, notesOf, storedLinesOf } from './preview-lines';

function parsed(extra: Partial<ParsedOperation> = {}): ParsedOperation {
    return {
        sheet: '',
        line: 2,
        kind: 'buy',
        incomeKind: null,
        direction: 'credit',
        tradeDate: '2026-01-10',
        ticker: 'ITUB4',
        productName: 'SECRET PRODUCT NAME',
        institution: 'SECRET BROKER',
        market: null,
        quantity: '10',
        unitPrice: '5',
        grossMinor: 5000,
        currency: 'BRL',
        appliedToPosition: true,
        matchKey: '2026-01-10|ITUB4|buy|10|5',
        alreadyImported: false,
        ...extra
    };
}

function statement(operations: ParsedOperation[]): ParsedInvestmentStatement {
    return {
        source: 'b3',
        reportKinds: ['negotiation'],
        currency: 'BRL',
        operations,
        positionAdjustments: [],
        fixedIncome: [],
        ignored: [{ sheet: '', line: 5, reason: 'settlement', description: 'SECRET TEXT', tradeDate: '2026-01-11' }],
        rejected: [{ sheet: '', line: 6, reason: 'invalid_date' }]
    };
}

describe('preview lines', () => {
    it('numbers the lines and tells identical operations apart by occurrence', () => {
        const lines = storedLinesOf(statement([parsed(), parsed(), parsed({ ticker: 'VALE3' })]));

        expect(lines.map((line) => line.lineId)).toEqual(['L1', 'L2', 'L3']);
        expect(new Set(lines.map((line) => line.sourceRef)).size).toBe(3);
        expect(lines[0]?.sourceRef.endsWith(':1')).toBe(true);
        expect(lines[1]?.sourceRef.endsWith(':2')).toBe(true);
    });

    it('keeps the direction only for split and reverse split', () => {
        const lines = storedLinesOf(
            statement([parsed({ kind: 'split', direction: 'debit' }), parsed({ kind: 'buy', direction: 'debit' })])
        );

        expect(lines.map((line) => line.direction)).toEqual(['debit', 'credit']);
    });

    it('never carries the free text of the report', () => {
        const input: ParsedInvestmentStatement = statement([parsed()]);
        const dump: string = JSON.stringify([storedLinesOf(input), ignoredViewsOf(input), notesOf(input)]);

        expect(dump).not.toContain('SECRET');
    });

    it('counts what was left out in notes', () => {
        expect(notesOf(statement([]))).toEqual([
            { code: 'rows_rejected', count: 1 },
            { code: 'rows_ignored', count: 1 }
        ]);
    });
});
