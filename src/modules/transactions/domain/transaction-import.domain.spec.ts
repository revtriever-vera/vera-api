import { describe, expect, it, vi } from 'vitest';
import { makeTransactionImport } from '../../../../test/support/spending-factories';
import { TransactionImportsRepository } from '../repositories/transaction-imports.repository';
import { TransactionImportDomain } from './transaction-import.domain';

function build(found: unknown = makeTransactionImport({ id: 'i1' })): {
    domain: TransactionImportDomain;
    repo: Record<string, ReturnType<typeof vi.fn>>;
} {
    const repo: Record<string, ReturnType<typeof vi.fn>> = {
        create: vi.fn().mockImplementation((data: object) => Promise.resolve(makeTransactionImport({ ...data }))),
        finish: vi.fn().mockResolvedValue(found),
        findById: vi.fn().mockResolvedValue(found),
        markUndone: vi.fn().mockResolvedValue(found),
        page: vi.fn().mockResolvedValue({ data: [], pagination: { page: 1, pageSize: 50, totalRecords: 0, totalPages: 0 } }),
        countCompleted: vi.fn().mockResolvedValue(3),
        softDeleteByAccounts: vi.fn().mockResolvedValue([])
    };
    return { domain: new TransactionImportDomain(repo as unknown as TransactionImportsRepository), repo };
}

describe('TransactionImportDomain', () => {
    it('registra o lote em processamento e conclui por padrão', async () => {
        const { domain, repo } = build();

        await domain.record({ accountId: 'a', format: 'csv_generic', fileName: 'x.csv', fileSha256: 'b'.repeat(64), rows: 9 });
        await domain.finish('i1', { inserted: 1, duplicates: 2, rejected: 3 });
        await domain.finish('i1', { inserted: 0, duplicates: 0, rejected: 9, status: 'failed' });

        expect(repo['create']).toHaveBeenCalledWith(expect.objectContaining({ status: 'processing', periodStart: null, isSample: false }));
        expect(repo['finish']).toHaveBeenNthCalledWith(1, 'i1', { inserted: 1, duplicates: 2, rejected: 3, status: 'completed' });
        expect(repo['finish']).toHaveBeenNthCalledWith(2, 'i1', expect.objectContaining({ status: 'failed' }));
    });

    it('require, finish e markUndone levantam 404 quando o lote não existe', async () => {
        const { domain } = build(null);

        await expect(domain.require('x')).rejects.toMatchObject({ code: 'imports.import_not_found' });
        await expect(domain.finish('x', { inserted: 0, duplicates: 0, rejected: 0 })).rejects.toMatchObject({
            code: 'imports.import_not_found'
        });
        await expect(domain.markUndone('x')).rejects.toMatchObject({ code: 'imports.import_not_found' });
    });

    it('lê o lote, pagina, conta e só remove por conta quando há contas', async () => {
        const { domain, repo } = build();

        await expect(domain.require('i1')).resolves.toMatchObject({ id: 'i1' });
        await expect(domain.markUndone('i1')).resolves.toMatchObject({ id: 'i1' });
        await expect(domain.page(1, 50)).resolves.toMatchObject({ data: [] });
        await expect(domain.countCompleted()).resolves.toBe(3);
        await domain.removeByAccounts([]);
        await domain.removeByAccounts(['a']);
        expect(repo['softDeleteByAccounts']).toHaveBeenCalledTimes(1);
    });
});
