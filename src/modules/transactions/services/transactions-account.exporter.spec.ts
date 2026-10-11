import { describe, expect, it, vi } from 'vitest';
import { makeCategory, makeFinancialAccount, makeTransaction, makeTransactionImport } from '../../../../test/support/spending-factories';
import { CategoryReaderService } from '../../spending-categories/services/category-reader.service';
import { FinancialAccountDomain } from '../domain/financial-account.domain';
import { TransactionImportDomain } from '../domain/transaction-import.domain';
import { TransactionDomain } from '../domain/transaction.domain';
import { EXPORT_PAGE_SIZE } from '../domain/transactions.types';
import { TransactionsAccountExporter } from './transactions-account.exporter';

const FORBIDDEN_KEYS: readonly string[] = [
    'id',
    'companyId',
    'accountId',
    'externalId',
    'counterpartyKey',
    'absorbedExternalId',
    'fileSha256',
    'isSample',
    'deletedAt'
];

function keysOf(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value.flatMap(keysOf);
    }
    if (value !== null && typeof value === 'object') {
        return Object.entries(value).flatMap(([key, inner]: [string, unknown]): string[] => [key, ...keysOf(inner)]);
    }
    return [];
}

function build(pages: ReturnType<typeof makeTransaction>[][]): {
    exporter: TransactionsAccountExporter;
    listAfter: ReturnType<typeof vi.fn>;
} {
    const listAfter: ReturnType<typeof vi.fn> = vi.fn();
    for (const page of pages) {
        listAfter.mockResolvedValueOnce(page);
    }
    listAfter.mockResolvedValue([]);
    const exporter: TransactionsAccountExporter = new TransactionsAccountExporter(
        {
            listAll: vi.fn().mockResolvedValue([
                makeFinancialAccount({
                    id: 'a1',
                    name: 'Conta Real',
                    provider: 'pluggy',
                    numberLast4: '1234',
                    institutionName: 'Banco'
                }),
                makeFinancialAccount({ id: 'a2', name: 'Conta de exemplo', isSample: true })
            ])
        } as unknown as FinancialAccountDomain,
        { listAfter } as unknown as TransactionDomain,
        {
            listRealPage: vi
                .fn()
                .mockResolvedValueOnce([makeTransactionImport({ id: 'i1', accountId: 'a1', fileSha256: 'f'.repeat(64) })])
                .mockResolvedValue([])
        } as unknown as TransactionImportDomain,
        {
            listForCompany: vi
                .fn()
                .mockResolvedValue([
                    makeCategory({ id: 'c-system', systemKey: 'groceries', name: null }),
                    makeCategory({ id: 'c-user', systemKey: null, name: 'Pets' })
                ])
        } as unknown as CategoryReaderService
    );
    return { exporter, listAfter };
}

describe('TransactionsAccountExporter', () => {
    it('exporta contas reais, transações com a categoria por chave e lotes, sem identificadores nem hashes', async () => {
        const { exporter, listAfter } = build([
            [
                makeTransaction({
                    accountId: 'a1',
                    categoryId: 'c-system',
                    categorySource: 'rule',
                    counterpartyKey: 'f'.repeat(64),
                    installmentNumber: 2,
                    installmentTotal: 5,
                    amountMinor: '-12345'
                }),
                makeTransaction({ accountId: 'a1', categoryId: 'c-user' }),
                makeTransaction({ accountId: 'a1', categoryId: null })
            ]
        ]);

        const exported = await exporter.exportAll();

        expect(exporter.area).toBe('transactions');
        expect(exported.accounts).toEqual([
            { name: 'Conta Real', kind: 'checking', institutionName: 'Banco', numberLast4: '1234', currency: 'BRL', source: 'pluggy' }
        ]);
        expect(exported.transactions.map((item) => item.category)).toEqual(['groceries', 'Pets', null]);
        expect(exported.transactions[0]).toMatchObject({
            account: 'Conta Real',
            amountMinor: -12_345,
            categorySource: 'rule',
            installment: { number: 2, total: 5 }
        });
        expect(exported.transactions[1]?.installment).toBeNull();
        expect(exported.imports).toEqual([
            {
                format: 'ofx',
                fileName: 'extrato.ofx',
                rows: 3,
                inserted: 2,
                duplicates: 1,
                createdAt: '2026-10-01T10:00:00.000Z',
                status: 'completed'
            }
        ]);
        expect(keysOf(exported).filter((key: string): boolean => FORBIDDEN_KEYS.includes(key))).toEqual([]);
        expect(JSON.stringify(exported)).not.toMatch(/[0-9a-f]{64}/);
        expect(listAfter).toHaveBeenCalledWith(expect.objectContaining({ excludeSamples: true }), null, EXPORT_PAGE_SIZE);
    });

    it('monta o array em páginas de 1.000 seguindo o cursor', async () => {
        const full = Array.from({ length: EXPORT_PAGE_SIZE }, (_: unknown, index: number) =>
            makeTransaction({ id: `t${String(index).padStart(5, '0')}`, accountId: 'a1' })
        );
        const { exporter, listAfter } = build([full, [makeTransaction({ accountId: 'a1' })]]);

        const exported = await exporter.exportAll();

        expect(exported.transactions).toHaveLength(EXPORT_PAGE_SIZE + 1);
        expect(listAfter).toHaveBeenCalledTimes(2);
        expect(listAfter.mock.calls[1]?.[1]).toEqual({ date: '2026-09-10', id: `t${String(EXPORT_PAGE_SIZE - 1).padStart(5, '0')}` });
    });

    it('pagina também os lotes de importação', async () => {
        const full = Array.from({ length: EXPORT_PAGE_SIZE }, (_: unknown, index: number) =>
            makeTransactionImport({ id: `i${String(index)}` })
        );
        const listRealPage = vi.fn().mockResolvedValueOnce(full).mockResolvedValueOnce([makeTransactionImport()]).mockResolvedValue([]);
        const exporter: TransactionsAccountExporter = new TransactionsAccountExporter(
            { listAll: vi.fn().mockResolvedValue([]) } as unknown as FinancialAccountDomain,
            { listAfter: vi.fn().mockResolvedValue([]) } as unknown as TransactionDomain,
            { listRealPage } as unknown as TransactionImportDomain,
            { listForCompany: vi.fn().mockResolvedValue([]) } as unknown as CategoryReaderService
        );

        const exported = await exporter.exportAll();

        expect(exported.imports).toHaveLength(EXPORT_PAGE_SIZE + 1);
        expect(listRealPage).toHaveBeenNthCalledWith(2, EXPORT_PAGE_SIZE, EXPORT_PAGE_SIZE);
    });
});
