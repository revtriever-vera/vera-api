import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeFinancialAccount, makeTransaction } from '../../../../test/support/spending-factories';
import { DatabaseClient } from '../../../core/database/database.client';
import { TransactionalContext } from '../../../core/database/using-transaction.decorator';
import { TransactionCategorizerService } from '../../spending-categories/services/transaction-categorizer.service';
import { FinancialAccountDomain } from '../domain/financial-account.domain';
import { TransactionDomain } from '../domain/transaction.domain';
import { FinancialAccount, IncomingTransaction, NewTransaction, Transaction } from '../domain/transactions.types';
import { TransactionIngestionService } from './transaction-ingestion.service';
import { TransactionsLogService } from './transactions-log.service';
import { TransactionsMetricsService } from './transactions-metrics.service';

const KEY: string = 'f'.repeat(64);

interface Built {
    readonly service: TransactionIngestionService;
    readonly domain: Record<string, ReturnType<typeof vi.fn>>;
    readonly categorize: ReturnType<typeof vi.fn>;
    readonly lock: ReturnType<typeof vi.fn>;
    readonly ingested: ReturnType<typeof vi.fn>;
    readonly metricsIngested: ReturnType<typeof vi.fn>;
    readonly sha256Hex: ReturnType<typeof vi.fn>;
}

interface Overrides {
    readonly existing?: Transaction[];
    readonly absorbing?: Transaction[];
    readonly fileRows?: Transaction[];
    readonly providerRows?: Transaction[];
    readonly insertConflict?: boolean;
}

function incoming(externalId: string, overrides: Partial<IncomingTransaction> = {}): IncomingTransaction {
    return { externalId, date: '2026-09-10', amountMinor: -5000, currency: 'BRL', description: 'Compra', ...overrides };
}

function build(account: FinancialAccount, overrides: Overrides = {}): Built {
    const lock: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(account);
    const domain: Record<string, ReturnType<typeof vi.fn>> = {
        findByExternalIds: vi.fn().mockResolvedValue(overrides.existing ?? []),
        findAbsorbing: vi.fn().mockResolvedValue(overrides.absorbing ?? []),
        fileRows: vi.fn().mockResolvedValue(overrides.fileRows ?? []),
        unabsorbedProviderRows: vi.fn().mockResolvedValue(overrides.providerRows ?? []),
        insertMany: vi
            .fn()
            .mockImplementation((rows: NewTransaction[]) =>
                Promise.resolve(overrides.insertConflict === true ? [] : rows.map((row: NewTransaction) => row.externalId))
            ),
        assertRoomFor: vi.fn().mockResolvedValue(undefined),
        markAbsorbed: vi.fn().mockResolvedValue(undefined),
        markSuperseded: vi.fn().mockResolvedValue(undefined),
        patch: vi.fn().mockResolvedValue(undefined),
        newId: vi.fn().mockImplementation(() => `new-${String(Math.random())}`)
    };
    const categorize: ReturnType<typeof vi.fn> = vi
        .fn()
        .mockImplementation((inputs: unknown[]) =>
            Promise.resolve(inputs.map(() => ({ categoryId: 'cat-1', source: 'dictionary', ruleId: null })))
        );
    const ingested: ReturnType<typeof vi.fn> = vi.fn();
    const metricsIngested: ReturnType<typeof vi.fn> = vi.fn();
    const sha256Hex: ReturnType<typeof vi.fn> = vi.fn().mockReturnValue(KEY);
    const service: TransactionIngestionService = new TransactionIngestionService(
        { require: vi.fn().mockResolvedValue(account), lock } as unknown as FinancialAccountDomain,
        domain as unknown as TransactionDomain,
        { categorizeMany: categorize } as unknown as TransactionCategorizerService,
        { normalize: (text: string): string => text.toUpperCase() },
        { sha256Hex },
        { ingested } as unknown as TransactionsLogService,
        { ingested: metricsIngested } as unknown as TransactionsMetricsService
    );
    return { service, domain, categorize, lock, ingested, metricsIngested, sha256Hex };
}

function insertedRows(built: Built): NewTransaction[] {
    return (built.domain['insertMany']?.mock.calls ?? []).flatMap((call: unknown[]) => call[0] as NewTransaction[]);
}

beforeEach(() => {
    TransactionalContext.set({ withTransaction: async <T>(fn: () => Promise<T>): Promise<T> => fn() } as unknown as DatabaseClient);
});

describe('TransactionIngestionService', () => {
    const account: FinancialAccount = makeFinancialAccount({ id: 'acc', currency: 'BRL' });

    it('insere e categoriza o lote uma vez, com a moeda da conta e o lock da conta', async () => {
        const built: Built = build(account);

        const result = await built.service.ingest({
            accountId: 'acc',
            source: 'pluggy',
            items: [incoming('pluggy:1'), incoming('pluggy:2', { currency: 'USD' })]
        });

        expect(result).toEqual({ inserted: 2, updated: 0, unchanged: 0, duplicates: 0, superseded: 0, rejected: 0 });
        expect(built.categorize).toHaveBeenCalledTimes(1);
        expect(built.lock).toHaveBeenCalledWith('acc');
        expect(insertedRows(built)).toMatchObject([
            { accountId: 'acc', currency: 'BRL', categoryId: 'cat-1', categorySource: 'dictionary', isSample: false },
            { currency: 'BRL' }
        ]);
        expect(built.ingested).toHaveBeenCalled();
        expect(built.metricsIngested).toHaveBeenCalledWith('pluggy', result);
    });

    it('reingestão sem mudança dá unchanged e não escreve nada', async () => {
        const row: Transaction = makeTransaction({ externalId: 'pluggy:1', description: 'Compra', amountMinor: '-5000' });
        const built: Built = build(account, { existing: [row] });

        const result = await built.service.ingest({ accountId: 'acc', source: 'pluggy', items: [incoming('pluggy:1')] });

        expect(result).toMatchObject({ unchanged: 1, inserted: 0 });
        expect(built.domain['patch']).not.toHaveBeenCalled();
        expect(built.categorize).toHaveBeenCalledWith([]);
    });

    it('mudança de descrição recategoriza quando a origem não é o usuário', async () => {
        const row: Transaction = makeTransaction({
            id: 'row-1',
            externalId: 'pluggy:1',
            description: 'Antiga',
            categorySource: 'dictionary'
        });
        const built: Built = build(account, { existing: [row] });

        const result = await built.service.ingest({ accountId: 'acc', source: 'pluggy', items: [incoming('pluggy:1')] });

        expect(result).toMatchObject({ updated: 1 });
        expect(built.domain['patch']).toHaveBeenCalledWith(
            'row-1',
            expect.objectContaining({ description: 'Compra', categoryId: 'cat-1', categorySource: 'dictionary' })
        );
    });

    it('mudança de descrição preserva a categoria escolhida pelo usuário', async () => {
        const row: Transaction = makeTransaction({
            id: 'row-1',
            externalId: 'pluggy:1',
            description: 'Antiga',
            categorySource: 'user',
            categoryId: 'mine'
        });
        const built: Built = build(account, { existing: [row] });

        await built.service.ingest({ accountId: 'acc', source: 'pluggy', items: [incoming('pluggy:1')] });

        const patch: Record<string, unknown> = built.domain['patch']?.mock.calls[0]?.[1] as Record<string, unknown>;
        expect(patch).toMatchObject({ description: 'Compra' });
        expect(patch).not.toHaveProperty('categoryId');
        expect(patch).not.toHaveProperty('categorySource');
    });

    it('o documento vira HMAC e nunca aparece no valor gravado', async () => {
        const built: Built = build(account);

        await built.service.ingest({
            accountId: 'acc',
            source: 'pluggy',
            items: [incoming('pluggy:1', { counterpartyDocument: '000.000.001-91', counterpartyName: 'Maria Souza' })]
        });

        expect(built.sha256Hex).toHaveBeenCalledWith('doc:00000000191');
        expect(insertedRows(built)[0]).toMatchObject({ counterpartyKey: KEY, counterpartyName: 'Maria Souza' });
        expect(JSON.stringify(built.domain['insertMany']?.mock.calls)).not.toContain('00000000191');
    });

    it('valor zero e linhas inválidas dão rejected; ids repetidos viram duplicates', async () => {
        const built: Built = build(account);

        const result = await built.service.ingest({
            accountId: 'acc',
            source: 'pluggy',
            items: [
                incoming('pluggy:z', { amountMinor: 0 }),
                incoming('pluggy:d', { date: 'ontem' }),
                incoming('pluggy:k'),
                incoming('pluggy:k')
            ]
        });

        expect(result).toMatchObject({ rejected: 2, duplicates: 1, inserted: 1 });
    });

    it('arquivo chegando é absorvido pela linha da Pluggy e conta como duplicata', async () => {
        const target: Transaction = makeTransaction({ id: 'p1', source: 'pluggy', amountMinor: '-5000' });
        const built: Built = build(account, { providerRows: [target] });

        const result = await built.service.ingest({
            accountId: 'acc',
            source: 'ofx',
            importId: 'imp-1',
            items: [incoming('ofx:1', { date: '2026-09-11' }), incoming('ofx:2', { amountMinor: -777 })]
        });

        expect(result).toMatchObject({ duplicates: 1, inserted: 1 });
        expect(built.domain['markAbsorbed']).toHaveBeenCalledWith('p1', 'ofx:1', 'imp-1');
        expect(insertedRows(built)).toMatchObject([{ externalId: 'ofx:2', importId: 'imp-1' }]);
    });

    it('arquivo já absorvido antes é duplicata e não grava', async () => {
        const absorbing: Transaction = makeTransaction({ absorbedExternalId: 'ofx:1' });
        const built: Built = build(account, { absorbing: [absorbing] });

        const result = await built.service.ingest({ accountId: 'acc', source: 'ofx', items: [incoming('ofx:1')] });

        expect(result).toMatchObject({ duplicates: 1, inserted: 0 });
        expect(insertedRows(built)).toEqual([]);
    });

    it('linha de arquivo repetida e sem mudança também conta como duplicata', async () => {
        const row: Transaction = makeTransaction({ externalId: 'ofx:1', source: 'ofx', description: 'Compra', amountMinor: '-5000' });
        const built: Built = build(account, { existing: [row] });

        const result = await built.service.ingest({ accountId: 'acc', source: 'ofx', items: [incoming('ofx:1')] });

        expect(result).toMatchObject({ duplicates: 1, unchanged: 0 });
    });

    it('Pluggy chegando substitui o arquivo e herda a categoria escolhida pelo usuário', async () => {
        const file: Transaction = makeTransaction({
            id: 'f1',
            externalId: 'ofx:1',
            source: 'ofx',
            importId: 'imp-9',
            amountMinor: '-5000',
            categoryId: 'mine',
            categorySource: 'user',
            ruleId: null
        });
        const built: Built = build(account, { fileRows: [file] });

        const result = await built.service.ingest({ accountId: 'acc', source: 'pluggy', items: [incoming('pluggy:1')] });

        expect(result).toMatchObject({ superseded: 1, inserted: 0 });
        expect(insertedRows(built)[0]).toMatchObject({
            categoryId: 'mine',
            categorySource: 'user',
            absorbedExternalId: 'ofx:1',
            absorbedImportId: 'imp-9'
        });
        expect(built.domain['markSuperseded']).toHaveBeenCalledWith('f1', insertedRows(built)[0]?.id);
        expect(built.categorize).toHaveBeenCalledWith([]);
    });

    it('Pluggy chegando sobre arquivo sem escolha do usuário categoriza de novo', async () => {
        const file: Transaction = makeTransaction({
            id: 'f1',
            externalId: 'ofx:1',
            source: 'ofx',
            amountMinor: '-5000',
            categorySource: 'dictionary'
        });
        const built: Built = build(account, { fileRows: [file] });

        await built.service.ingest({ accountId: 'acc', source: 'pluggy', items: [incoming('pluggy:1')] });

        expect(insertedRows(built)[0]).toMatchObject({ categoryId: 'cat-1', categorySource: 'dictionary' });
    });

    it('conflito na inserção (outra gravação ganhou) vira unchanged e não substitui o arquivo', async () => {
        const file: Transaction = makeTransaction({ id: 'f1', source: 'ofx', amountMinor: '-5000' });
        const built: Built = build(account, { fileRows: [file], insertConflict: true });

        const result = await built.service.ingest({
            accountId: 'acc',
            source: 'pluggy',
            items: [incoming('pluggy:1'), incoming('pluggy:2', { amountMinor: -1 })]
        });

        expect(result).toMatchObject({ unchanged: 2, superseded: 0, inserted: 0 });
        expect(built.domain['markSuperseded']).not.toHaveBeenCalled();
    });

    it('lote de exemplo grava isSample por padrão e respeita o valor explícito', async () => {
        const sample: Built = build(account);
        const explicit: Built = build(account);

        await sample.service.ingest({ accountId: 'acc', source: 'sample', items: [incoming('sample:1')] });
        await explicit.service.ingest({ accountId: 'acc', source: 'sample', isSample: false, items: [incoming('sample:1')] });

        expect(insertedRows(sample)[0]?.isSample).toBe(true);
        expect(insertedRows(explicit)[0]?.isSample).toBe(false);
        expect(sample.domain['fileRows']).not.toHaveBeenCalled();
        expect(sample.domain['unabsorbedProviderRows']).not.toHaveBeenCalled();
    });

    it('divide lotes grandes em transações de 500 linhas e junta os contadores', async () => {
        const built: Built = build(account);
        const items: IncomingTransaction[] = Array.from({ length: 1201 }, (_, index: number) =>
            incoming(`pluggy:${String(index).padStart(5, '0')}`)
        );

        const result = await built.service.ingest({ accountId: 'acc', source: 'pluggy', items });

        expect(result.inserted).toBe(1201);
        expect(built.lock).toHaveBeenCalledTimes(3);
        expect(built.domain['insertMany']?.mock.calls.map((call: unknown[]) => (call[0] as unknown[]).length)).toEqual([500, 500, 201]);
    });

    it('lote vazio não toca o banco', async () => {
        const built: Built = build(account);

        const result = await built.service.ingest({ accountId: 'acc', source: 'pluggy', items: [] });

        expect(result.inserted).toBe(0);
        expect(built.lock).not.toHaveBeenCalled();
    });
});
