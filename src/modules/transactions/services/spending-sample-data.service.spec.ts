import { describe, expect, it, vi } from 'vitest';
import { makeFinancialAccount } from '../../../../test/support/spending-factories';
import { CategoryReaderService } from '../../spending-categories/services/category-reader.service';
import { CategoryRuleService } from '../../spending-categories/services/category-rule.service';
import { FinancialAccountDomain } from '../domain/financial-account.domain';
import { TransactionImportDomain } from '../domain/transaction-import.domain';
import { TransactionDomain } from '../domain/transaction.domain';
import { FinancialAccount } from '../domain/transactions.types';
import { AppContext } from '../../../core/context/app-context.port';
import { AppLocale } from '../../../shared/i18n/locale';
import { SpendingDatasetService } from './spending-dataset.service';
import { SpendingSampleDatasetService } from './spending-sample-dataset.service';
import { SpendingSampleDataService } from './spending-sample-data.service';
import { TransactionIngestionService } from './transaction-ingestion.service';
import { TransactionsLogService } from './transactions-log.service';

const TODAY: string = new Date().toISOString().slice(0, 10);
const DATASET_SIZE: number = new SpendingDatasetService().build(TODAY).transactions.length;

interface Built {
    readonly service: SpendingSampleDataService;
    readonly store: { accounts: FinancialAccount[]; realTransactions: number; sampleTransactions: number };
    readonly ingest: ReturnType<typeof vi.fn>;
    readonly accounts: Record<string, ReturnType<typeof vi.fn>>;
    readonly transactions: Record<string, ReturnType<typeof vi.fn>>;
    readonly imports: Record<string, ReturnType<typeof vi.fn>>;
    readonly rules: Record<string, ReturnType<typeof vi.fn>>;
    readonly logs: ReturnType<typeof vi.fn>;
}

function build(accounts: FinancialAccount[] = [], realTransactions: number = 0, locale: AppLocale = 'pt-BR'): Built {
    const store: Built['store'] = { accounts, realTransactions, sampleTransactions: 0 };
    const ingest: ReturnType<typeof vi.fn> = vi.fn().mockImplementation((batch: { items: unknown[] }) => {
        store.sampleTransactions += batch.items.length;
        return Promise.resolve({ inserted: batch.items.length });
    });
    const accountDomain: Record<string, ReturnType<typeof vi.fn>> = {
        listAll: vi.fn().mockImplementation(() => Promise.resolve([...store.accounts])),
        createFile: vi.fn().mockImplementation((input: object) => {
            const created: FinancialAccount = makeFinancialAccount({ ...input });
            store.accounts.push(created);
            return Promise.resolve(created);
        }),
        removeMany: vi.fn().mockResolvedValue([]),
        promoteToReal: vi.fn().mockResolvedValue(0)
    };
    const transactionDomain: Record<string, ReturnType<typeof vi.fn>> = {
        countReal: vi.fn().mockImplementation(() => Promise.resolve(store.realTransactions)),
        countSamples: vi.fn().mockImplementation(() => Promise.resolve(store.sampleTransactions)),
        removeSamples: vi.fn().mockResolvedValue(DATASET_SIZE),
        statsByAccount: vi.fn().mockResolvedValue([])
    };
    const importDomain: Record<string, ReturnType<typeof vi.fn>> = { removeSamples: vi.fn().mockResolvedValue(0) };
    const rules: Record<string, ReturnType<typeof vi.fn>> = { removeSamples: vi.fn().mockResolvedValue(1) };
    const sample: ReturnType<typeof vi.fn> = vi.fn();
    const service: SpendingSampleDataService = new SpendingSampleDataService(
        accountDomain as unknown as FinancialAccountDomain,
        transactionDomain as unknown as TransactionDomain,
        importDomain as unknown as TransactionImportDomain,
        { listForCompany: vi.fn().mockResolvedValue([]) } as unknown as CategoryReaderService,
        rules as unknown as CategoryRuleService,
        new SpendingSampleDatasetService(new SpendingDatasetService(), {
            get: () => ({ requestId: 'r', locale })
        } as unknown as AppContext),
        { ingest } as unknown as TransactionIngestionService,
        { sample } as unknown as TransactionsLogService
    );
    return { service, store, ingest, accounts: accountDomain, transactions: transactionDomain, imports: importDomain, rules, logs: sample };
}

describe('SpendingSampleDataService', () => {
    it('é a porta da área spending', () => {
        expect(build().service.area).toBe('spending');
    });

    it('semeia as três contas de exemplo e o conjunto canônico inteiro, marcados como exemplo', async () => {
        const built: Built = build();

        const seeded: number = await built.service.seed();

        expect(seeded).toBe(DATASET_SIZE);
        expect(built.accounts['createFile']).toHaveBeenCalledTimes(3);
        expect(built.store.accounts.map((account: FinancialAccount): string => account.name)).toEqual([
            'Cartão de exemplo',
            'Conta de exemplo',
            'Conta 2 de exemplo'
        ]);
        expect(built.store.accounts.every((account: FinancialAccount): boolean => account.isSample)).toBe(true);
        for (const call of built.ingest.mock.calls) {
            const batch = call[0] as { source: string; isSample: boolean; items: { externalId: string }[] };
            expect(batch).toMatchObject({ source: 'sample', isSample: true });
            expect(batch.items.every((item: { externalId: string }): boolean => item.externalId.startsWith('sample:'))).toBe(true);
        }
        expect(built.logs).toHaveBeenCalledWith('seeded', DATASET_SIZE);
    });

    it('numa sessão em inglês, cria as contas de exemplo com nome em inglês e o mesmo conjunto canônico', async () => {
        const built: Built = build([], 0, 'en');

        await expect(built.service.seed()).resolves.toBe(DATASET_SIZE);

        expect(built.store.accounts.map((account: FinancialAccount): string => account.name)).toEqual([
            'Sample card',
            'Sample account',
            'Sample account 2'
        ]);
    });

    it('com conta real não grava nada', async () => {
        const built: Built = build([makeFinancialAccount()]);

        await expect(built.service.seed()).resolves.toBe(0);

        expect(built.ingest).not.toHaveBeenCalled();
        expect(built.accounts['createFile']).not.toHaveBeenCalled();
        expect(built.logs).toHaveBeenCalledWith('skipped', 0);
    });

    it('com transação real não grava nada', async () => {
        const built: Built = build([], 3);

        await expect(built.service.seed()).resolves.toBe(0);

        expect(built.ingest).not.toHaveBeenCalled();
    });

    it('semear duas vezes não duplica', async () => {
        const built: Built = build();

        await built.service.seed();
        const second: number = await built.service.seed();

        expect(second).toBe(0);
        expect(built.accounts['createFile']).toHaveBeenCalledTimes(3);
    });

    it('limpar apaga transações, lotes, contas e regras de exemplo e devolve a contagem de transações', async () => {
        const built: Built = build([makeFinancialAccount({ id: 's1', isSample: true }), makeFinancialAccount({ id: 'r1' })]);

        const cleared: number = await built.service.clear();

        expect(cleared).toBe(DATASET_SIZE);
        expect(built.transactions['removeSamples']).toHaveBeenCalledOnce();
        expect(built.imports['removeSamples']).toHaveBeenCalledOnce();
        expect(built.accounts['removeMany']).toHaveBeenCalledWith(['s1']);
        expect(built.rules['removeSamples']).toHaveBeenCalledOnce();
        expect(built.logs).toHaveBeenCalledWith('cleared', DATASET_SIZE);
    });

    it('limpar promove a conta de exemplo que ainda guarda transação real', async () => {
        const built: Built = build([
            makeFinancialAccount({ id: 's1', isSample: true }),
            makeFinancialAccount({ id: 's2', isSample: true })
        ]);
        built.transactions['statsByAccount']?.mockResolvedValue([{ accountId: 's1', transactionCount: 4, lastTransactionDate: null }]);

        await built.service.clear();

        expect(built.accounts['promoteToReal']).toHaveBeenCalledWith(['s1']);
        expect(built.accounts['removeMany']).toHaveBeenCalledWith(['s2']);
    });
});
