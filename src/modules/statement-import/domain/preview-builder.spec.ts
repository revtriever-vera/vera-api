import { describe, expect, it } from 'vitest';
import { sanitizeFileName } from './file-name';
import { buildPreview, exceedsYears, periodOf } from './preview-builder';
import { ParsedRow, ParsedStatement } from './statement-import.types';

function row(index: number, date: string): ParsedRow {
    return { line: index, date, amountMinor: -100 * (index + 1), description: `d${String(index)}`, externalId: null };
}

describe('periodOf', () => {
    it('devolve o menor e o maior dia, e nulo sem linhas', () => {
        expect(periodOf([row(1, '2026-09-10'), row(2, '2026-09-01'), row(3, '2026-09-30')])).toEqual({
            start: '2026-09-01',
            end: '2026-09-30'
        });
        expect(periodOf([])).toEqual({ start: null, end: null });
    });
});

describe('buildPreview', () => {
    it('limita a amostra a 10 linhas e os exemplos de rejeição a 20', () => {
        const statement: ParsedStatement = {
            format: 'csv_generic',
            rows: Array.from({ length: 15 }, (_unused, index: number) => row(index, '2026-09-01')),
            rejections: Array.from({ length: 25 }, (_unused, index: number) => ({ line: index, reason: 'invalid_date' as const })),
            currency: null,
            accountHint: null,
            columns: ['a'],
            pendingMappingRecords: null
        };

        const preview = buildPreview(statement, {
            detectedFormat: 'csv_generic',
            fileName: 'x.csv',
            suggestedAccountId: null,
            alreadyImportedAt: null
        });

        expect(preview.sample).toHaveLength(10);
        expect(preview.rejections).toHaveLength(20);
        expect(preview.rejected).toBe(25);
        expect(preview.rows).toBe(15);
    });

    it('usa a contagem de linhas de dados quando falta o mapping', () => {
        const statement: ParsedStatement = {
            format: 'csv_generic',
            rows: [],
            rejections: [],
            currency: null,
            accountHint: null,
            columns: ['a'],
            pendingMappingRecords: 7
        };

        const preview = buildPreview(statement, {
            detectedFormat: 'csv_generic',
            fileName: 'x.csv',
            suggestedAccountId: null,
            alreadyImportedAt: null
        });

        expect(preview.rows).toBe(7);
        expect(preview.periodStart).toBeNull();
    });
});

describe('exceedsYears', () => {
    it('compara o intervalo com o limite em anos', () => {
        expect(exceedsYears('2021-09-01', '2026-09-01', 5)).toBe(false);
        expect(exceedsYears('2021-09-01', '2026-09-02', 5)).toBe(true);
    });
});

describe('sanitizeFileName', () => {
    it('fica com o nome base, sem controle e com no máximo 120 caracteres', () => {
        expect(sanitizeFileName('C:\\Users\\x\\extrato.ofx')).toBe('extrato.ofx');
        expect(sanitizeFileName('../../etc/pass\u0000wd')).toBe('passwd');
        expect(sanitizeFileName('a'.repeat(300))).toHaveLength(120);
        expect(sanitizeFileName('')).toBe('statement');
        expect(sanitizeFileName('dir/')).toBe('statement');
    });
});
