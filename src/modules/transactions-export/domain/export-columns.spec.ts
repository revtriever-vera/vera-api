import { describe, expect, it } from 'vitest';
import { csvCellsOf, columnsOf, exportRowOf, headerOf, xlsxCellsOf } from './export-columns';
import { ExportTransaction, TransactionExportRow } from './transactions-export.types';

function transactionOf(overrides: Partial<ExportTransaction> = {}): ExportTransaction {
    return {
        id: 'id',
        accountId: 'account',
        accountName: 'Itaú Conta',
        institutionName: 'Itaú',
        date: '2026-09-14',
        amountMinor: -35_000,
        currency: 'BRL',
        description: 'Pix enviado · Maria Souza',
        counterpartyName: 'Maria Souza',
        categoryId: null,
        categorySource: 'none',
        source: 'pluggy',
        ...overrides
    };
}

function rowOf(overrides: Partial<ExportTransaction> = {}, locale: 'pt-BR' | 'en' = 'pt-BR'): TransactionExportRow {
    return exportRowOf(transactionOf(overrides), 'Sem categoria', locale);
}

describe('csvCellsOf', () => {
    it('writes negative amounts with decimal comma and the date as dd/MM/yyyy in pt-BR', () => {
        expect(csvCellsOf(rowOf(), 'pt-BR')).toEqual([
            '14/09/2026',
            'Pix enviado · Maria Souza',
            'Maria Souza',
            '-350,00',
            'BRL',
            'Sem categoria',
            '—',
            'Itaú Conta',
            'Itaú',
            'Open Finance (Meu Pluggy)'
        ]);
    });

    it('writes negative amounts with decimal point and the date as yyyy-MM-dd in en', () => {
        const cells: string[] = csvCellsOf(rowOf({}, 'en'), 'en');

        expect(cells[0]).toBe('2026-09-14');
        expect(cells[3]).toBe('-350.00');
        expect(cells[6]).toBe('—');
    });

    it('translates the origin and the source of the category', () => {
        const row: TransactionExportRow = rowOf({ categorySource: 'rule', source: 'ofx', counterpartyName: null, institutionName: null });

        expect(row.categoryOrigin).toBe('Sua regra');
        expect(row.source).toBe('Arquivo OFX');
        expect(row.counterparty).toBe('');
        expect(row.institution).toBe('');
        expect(rowOf({ categorySource: 'user', source: 'sample' }, 'en')).toMatchObject({
            categoryOrigin: 'Your correction',
            source: 'Example'
        });
    });

    it('neutralizes formulas in every free text column', () => {
        const row: TransactionExportRow = exportRowOf(
            transactionOf({
                description: '=HYPERLINK("http://x")',
                counterpartyName: '+cmd',
                accountName: '-2',
                institutionName: '@banco'
            }),
            '=categoria',
            'pt-BR'
        );

        expect(row.description).toBe(`'=HYPERLINK("http://x")`);
        expect(row.counterparty).toBe("'+cmd");
        expect(row.account).toBe("'-2");
        expect(row.institution).toBe("'@banco");
        expect(row.category).toBe("'=categoria");
    });
});

describe('xlsxCellsOf', () => {
    it('writes a date cell and a numeric amount with currency format', () => {
        const cells = xlsxCellsOf(rowOf());

        expect((cells[0] as Date).toISOString()).toBe('2026-09-14T00:00:00.000Z');
        expect(cells[3]).toEqual({ value: -350, numFmt: '"R$" #,##0.00' });
        expect(cells[4]).toBe('BRL');
    });
});

describe('headers and columns', () => {
    it('has ten headers per locale', () => {
        expect(headerOf('pt-BR')).toEqual([
            'Data',
            'Descrição',
            'Favorecido',
            'Valor',
            'Moeda',
            'Categoria',
            'Origem da categoria',
            'Conta',
            'Instituição',
            'Fonte'
        ]);
        expect(headerOf('en')[2]).toBe('Counterparty');
    });

    it('types the columns and picks the date format by locale', () => {
        expect(columnsOf('pt-BR')[0]).toMatchObject({ type: 'date', numFmt: 'dd/mm/yyyy' });
        expect(columnsOf('en')[0]).toMatchObject({ type: 'date', numFmt: 'yyyy-mm-dd' });
        expect(columnsOf('en')[3]?.type).toBe('number');
        expect(columnsOf('en')[1]?.type).toBe('text');
    });
});
