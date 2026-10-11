import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeTransactionImport } from '../../../../test/support/spending-factories';
import { DatabaseClient } from '../../../core/database/database.client';
import { TransactionalContext } from '../../../core/database/using-transaction.decorator';
import { FinancialAccountDomain } from '../domain/financial-account.domain';
import { TransactionImportDomain } from '../domain/transaction-import.domain';
import { TransactionDomain } from '../domain/transaction.domain';
import { TransactionImportService } from './transaction-import.service';

function build(status: string = 'completed'): {
    service: TransactionImportService;
    imports: Record<string, ReturnType<typeof vi.fn>>;
    transactions: Record<string, ReturnType<typeof vi.fn>>;
} {
    const imports: Record<string, ReturnType<typeof vi.fn>> = {
        record: vi.fn().mockResolvedValue(makeTransactionImport({ id: 'i1', status: 'processing' })),
        finish: vi.fn().mockResolvedValue(makeTransactionImport({ id: 'i1' })),
        require: vi.fn().mockResolvedValue(makeTransactionImport({ id: 'i1', status })),
        markUndone: vi.fn().mockResolvedValue(makeTransactionImport({ id: 'i1', status: 'undone' })),
        page: vi.fn().mockResolvedValue({
            data: [makeTransactionImport({ id: 'i1' })],
            pagination: { page: 1, pageSize: 50, totalRecords: 1, totalPages: 1 }
        }),
        countCompleted: vi.fn().mockResolvedValue(2)
    };
    const transactions: Record<string, ReturnType<typeof vi.fn>> = {
        removeByImport: vi.fn().mockResolvedValue(5),
        releaseAbsorbedByImport: vi.fn().mockResolvedValue(2)
    };
    const service: TransactionImportService = new TransactionImportService(
        imports as unknown as TransactionImportDomain,
        { require: vi.fn().mockResolvedValue({}) } as unknown as FinancialAccountDomain,
        transactions as unknown as TransactionDomain
    );
    return { service, imports, transactions };
}

beforeEach(() => {
    TransactionalContext.set({ withTransaction: async <T>(fn: () => Promise<T>): Promise<T> => fn() } as unknown as DatabaseClient);
});

describe('TransactionImportService', () => {
    it('registra o lote antes da ingestão e grava o resultado depois', async () => {
        const { service, imports } = build();

        const recorded = await service.record({ accountId: 'a', format: 'ofx', fileName: 'x.ofx', fileSha256: 'a'.repeat(64), rows: 3 });
        const finished = await service.finish('i1', { inserted: 2, duplicates: 1, rejected: 0 });

        expect(recorded).toMatchObject({ id: 'i1', status: 'processing' });
        expect(finished).toMatchObject({ id: 'i1', status: 'completed' });
        expect(imports['finish']).toHaveBeenCalledWith('i1', { inserted: 2, duplicates: 1, rejected: 0 });
    });

    it('desfazer remove as linhas, solta as absorvidas e marca o lote como undone', async () => {
        const { service, imports, transactions } = build();

        const undone = await service.undo('i1');

        expect(undone).toEqual({ removed: 5 });
        expect(transactions['removeByImport']).toHaveBeenCalledWith('i1');
        expect(transactions['releaseAbsorbedByImport']).toHaveBeenCalledWith('i1');
        expect(imports['markUndone']).toHaveBeenCalledWith('i1');
    });

    it('desfazer um lote já desfeito não faz nada', async () => {
        const { service, transactions } = build('undone');

        await expect(service.undo('i1')).resolves.toEqual({ removed: 0 });
        expect(transactions['removeByImport']).not.toHaveBeenCalled();
    });

    it('lista a página de lotes e conta os concluídos', async () => {
        const { service } = build();

        const page = await service.list(1);

        expect(page.data[0]).toMatchObject({ id: 'i1', fileName: 'extrato.ofx' });
        expect(page.pagination.totalRecords).toBe(1);
        await expect(service.countCompleted()).resolves.toBe(2);
    });
});
