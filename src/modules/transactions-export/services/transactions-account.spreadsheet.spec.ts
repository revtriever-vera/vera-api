import { describe, expect, it, vi } from 'vitest';
import { AppContext } from '../../../core/context/app-context.port';
import { SpreadsheetSheet } from '../../identity/services/account-spreadsheet-exporter.port';
import { CategoryReaderService } from '../../spending-categories/services/category-reader.service';
import { TransactionReaderService } from '../../transactions/services/transaction-reader.service';
import { ExportTransaction } from '../domain/transactions-export.types';
import { TransactionsAccountSpreadsheet } from './transactions-account.spreadsheet';

function transactionOf(index: number, overrides: Partial<ExportTransaction> = {}): ExportTransaction {
    return {
        id: `id-${String(index)}`,
        accountId: 'account',
        accountName: 'Conta',
        institutionName: null,
        date: '2026-09-05',
        amountMinor: -1000,
        currency: 'BRL',
        description: `compra ${String(index)}`,
        counterpartyName: null,
        categoryId: 'cat',
        categorySource: 'rule',
        source: 'pluggy',
        ...overrides
    };
}

async function* pagesOf(total: number): AsyncGenerator<readonly ExportTransaction[]> {
    await Promise.resolve();
    const size: number = 1000;
    for (let start: number = 0; start < total; start += size) {
        yield Array.from({ length: Math.min(size, total - start) }, (_unused: unknown, offset: number) => transactionOf(start + offset));
    }
}

function build(total: number) {
    const reader = { countForExport: vi.fn().mockResolvedValue(total), pagesForExport: vi.fn().mockReturnValue(pagesOf(total)) };
    const spreadsheet: TransactionsAccountSpreadsheet = new TransactionsAccountSpreadsheet(
        reader as unknown as TransactionReaderService,
        {
            listForCompany: vi.fn().mockResolvedValue([{ id: 'cat', name: 'Mercado', systemKey: null }])
        } as unknown as CategoryReaderService,
        { get: vi.fn().mockReturnValue({ requestId: 'r', locale: 'pt-BR' }) } as unknown as AppContext
    );
    return { spreadsheet, reader };
}

async function count(sheet: SpreadsheetSheet): Promise<number> {
    let rows: number = 0;
    for await (const row of sheet.rows) {
        rows += row.length > 0 ? 1 : 0;
    }
    return rows;
}

describe('TransactionsAccountSpreadsheet', () => {
    it('writes one transacoes file with the labelled rows and leaves samples out of the query', async () => {
        const { spreadsheet, reader } = build(2);

        const sheets: readonly SpreadsheetSheet[] = await spreadsheet.sheets();
        const rows: unknown[][] = [];
        for await (const row of (sheets[0] as SpreadsheetSheet).rows) {
            rows.push([...row]);
        }

        expect(sheets.map((sheet: SpreadsheetSheet) => [sheet.file, sheet.name])).toEqual([['transacoes', 'Transações']]);
        expect(rows).toHaveLength(2);
        expect(rows[0]?.[5]).toBe('Mercado');
        expect(reader.pagesForExport).toHaveBeenCalledWith(expect.objectContaining({ excludeSamples: true }));
    });

    it('still delivers an empty file when there are no transactions', async () => {
        const sheets: readonly SpreadsheetSheet[] = await build(0).spreadsheet.sheets();

        expect(sheets).toHaveLength(1);
        expect(await count(sheets[0] as SpreadsheetSheet)).toBe(0);
    });

    it('continues in transacoes-2 after fifty thousand rows, without losing or repeating any', async () => {
        const sheets: readonly SpreadsheetSheet[] = await build(50_003).spreadsheet.sheets();

        expect(sheets.map((sheet: SpreadsheetSheet) => sheet.file)).toEqual(['transacoes', 'transacoes-2']);
        expect(await count(sheets[0] as SpreadsheetSheet)).toBe(50_000);
        expect(await count(sheets[1] as SpreadsheetSheet)).toBe(3);
    }, 60_000);
});
