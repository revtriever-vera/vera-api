import { Workbook, Worksheet } from 'exceljs';
import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { AppContext } from '../../../core/context/app-context.port';
import { CompanyTimezoneService } from '../../identity/services/company-timezone.service';
import { CategoryReaderService } from '../../spending-categories/services/category-reader.service';
import { FinancialAccountService } from '../../transactions/services/financial-account.service';
import { TransactionReaderService } from '../../transactions/services/transaction-reader.service';
import { ExportTooLargeError } from '../domain/transactions-export.errors';
import { ExportTransaction } from '../domain/transactions-export.types';
import { TransactionsExportLogService } from '../services/transactions-export-log.service';
import { TransactionsExportMetricsService } from '../services/transactions-export-metrics.service';
import { TransactionsExportApplication } from './transactions-export.application';

function transactionOf(overrides: Partial<ExportTransaction>): ExportTransaction {
    return {
        id: 'id',
        accountId: 'account',
        accountName: 'Itaú Conta',
        institutionName: 'Itaú',
        date: '2026-09-05',
        amountMinor: 2_800_000,
        currency: 'BRL',
        description: 'SALARIO EMPRESA X',
        counterpartyName: null,
        categoryId: 'income',
        categorySource: 'provider',
        source: 'pluggy',
        ...overrides
    };
}

function pages(...items: ExportTransaction[][]): AsyncIterable<readonly ExportTransaction[]> {
    return Readable.from(items) as AsyncIterable<readonly ExportTransaction[]>;
}

function build(count: number = 2, locale: 'pt-BR' | 'en' = 'pt-BR') {
    const reader = {
        countForExport: vi.fn().mockResolvedValue(count),
        pagesForExport: vi.fn().mockReturnValue(
            pages(
                [transactionOf({})],
                [
                    transactionOf({
                        date: '2026-09-14',
                        amountMinor: -35_000,
                        description: '=HYPERLINK("x")',
                        categoryId: null,
                        categorySource: 'none'
                    })
                ]
            )
        )
    };
    const accounts = { requireById: vi.fn().mockResolvedValue({}) };
    const categories = { listForCompany: vi.fn().mockResolvedValue([{ id: 'income', systemKey: 'income', name: null }]) };
    const logs = { exported: vi.fn(), refused: vi.fn() };
    const metrics = { exported: vi.fn() };
    const application: TransactionsExportApplication = new TransactionsExportApplication(
        reader as unknown as TransactionReaderService,
        accounts as unknown as FinancialAccountService,
        categories as unknown as CategoryReaderService,
        { normalize: (text: string) => text.toUpperCase() },
        { todayInCompany: vi.fn().mockResolvedValue('2026-10-11') } as unknown as CompanyTimezoneService,
        { get: vi.fn().mockReturnValue({ requestId: 'req', locale }) } as unknown as AppContext,
        logs as unknown as TransactionsExportLogService,
        metrics as unknown as TransactionsExportMetricsService
    );
    return { application, reader, accounts, logs, metrics };
}

describe('TransactionsExportApplication', () => {
    it('builds the csv with BOM, translated category and neutralized text, and records log and metric', async () => {
        const { application, logs, metrics } = build();

        const file = await application.export('csv', { month: '2026-09' });

        expect(file).toMatchObject({ filename: 'vera-transacoes-2026-10-11.csv', contentType: 'text/csv; charset=utf-8', rows: 2 });
        expect(file.content.toString('utf8').split('\r\n')).toEqual([
            '﻿Data;Descrição;Favorecido;Valor;Moeda;Categoria;Origem da categoria;Conta;Instituição;Fonte',
            '05/09/2026;SALARIO EMPRESA X;;28000,00;BRL;Renda;Pluggy;Itaú Conta;Itaú;Open Finance (Meu Pluggy)',
            '14/09/2026;"\'=HYPERLINK(""x"")";;-350,00;BRL;Sem categoria;—;Itaú Conta;Itaú;Open Finance (Meu Pluggy)',
            ''
        ]);
        expect(logs.exported).toHaveBeenCalledWith('csv', 2, expect.any(Number), file.content.length);
        expect(metrics.exported).toHaveBeenCalledWith('csv', 'ok');
    });

    it('builds the xlsx with a date and a numeric amount', async () => {
        const { application } = build(2, 'en');

        const file = await application.export('xlsx', {});

        expect(file.filename).toBe('vera-transacoes-2026-10-11.xlsx');
        expect(file.rows).toBe(2);
        const workbook: Workbook = new Workbook();
        await workbook.xlsx.load(file.content as unknown as Parameters<Workbook['xlsx']['load']>[0]);
        const sheet: Worksheet = workbook.worksheets[0] as Worksheet;
        expect(sheet.name).toBe('Transactions');
        expect(sheet.getCell('A1').value).toBe('Date');
        expect(sheet.getCell('D3').value).toBe(-350);
        expect((sheet.getCell('A2').value as Date).toISOString().slice(0, 10)).toBe('2026-09-05');
        expect(sheet.getCell('F3').value).toBe('Uncategorized');
    });

    it('defaults to the current month of the company and applies the filters', async () => {
        const { application, reader, accounts } = build();

        await application.export('csv', { accountId: 'acc', categoryId: 'cat', direction: 'out', q: 'pix' });

        expect(accounts.requireById).toHaveBeenCalledWith('acc');
        expect(reader.pagesForExport).toHaveBeenCalledWith({
            fromDate: '2026-10-01',
            toDate: '2026-10-31',
            accountId: 'acc',
            categoryId: 'cat',
            uncategorized: false,
            direction: 'out',
            search: 'PIX'
        });
    });

    it('uses the range and the uncategorized flag when sent, and falls back to the raw search text', async () => {
        const { application, reader } = build();

        await application.export('csv', { from: '2026-01-01', to: '2026-03-31', uncategorized: 'true' });

        expect(reader.pagesForExport).toHaveBeenCalledWith(
            expect.objectContaining({ fromDate: '2026-01-01', toDate: '2026-03-31', uncategorized: true, search: undefined })
        );
    });

    it('refuses more than 50,000 rows with the count and does not read the pages', async () => {
        const { application, reader, logs, metrics } = build(50_001);

        const failure: unknown = await application.export('xlsx', {}).catch((error: unknown) => error);

        expect(failure).toBeInstanceOf(ExportTooLargeError);
        expect((failure as ExportTooLargeError).meta).toMatchObject({ rows: 50_001 });
        expect(reader.pagesForExport).not.toHaveBeenCalled();
        expect(logs.refused).toHaveBeenCalledWith('xlsx', 50_001);
        expect(metrics.exported).toHaveBeenCalledWith('xlsx', 'too_large');
    });

    it('accepts exactly 50,000 rows', async () => {
        const { application } = build(50_000);

        await expect(application.export('csv', {})).resolves.toMatchObject({ rows: 2 });
    });
});
