import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeFinancialAccount } from '../../../../test/support/spending-factories';
import { DatabaseClient } from '../../../core/database/database.client';
import { TransactionalContext } from '../../../core/database/using-transaction.decorator';
import { FinancialAccountDomain } from '../domain/financial-account.domain';
import { TransactionImportDomain } from '../domain/transaction-import.domain';
import { TransactionDomain } from '../domain/transaction.domain';
import { FinancialAccountService } from './financial-account.service';

function build(): {
    service: FinancialAccountService;
    accounts: Record<string, ReturnType<typeof vi.fn>>;
    transactions: Record<string, ReturnType<typeof vi.fn>>;
    imports: Record<string, ReturnType<typeof vi.fn>>;
} {
    const accounts: Record<string, ReturnType<typeof vi.fn>> = {
        upsertProvider: vi.fn().mockResolvedValue(makeFinancialAccount({ id: 'p' })),
        createFile: vi.fn().mockResolvedValue(makeFinancialAccount({ id: 'f' })),
        require: vi
            .fn()
            .mockImplementation((id: string) =>
                Promise.resolve(makeFinancialAccount({ id, provider: id === 'p' ? 'pluggy' : null, externalId: id === 'p' ? 'x' : null }))
            ),
        findByIds: vi
            .fn()
            .mockResolvedValue([makeFinancialAccount({ id: 'p', provider: 'pluggy', externalId: 'x' }), makeFinancialAccount({ id: 'f' })]),
        removeMany: vi.fn().mockImplementation((ids: string[]) => Promise.resolve(ids.map((id: string) => makeFinancialAccount({ id }))))
    };
    const transactions: Record<string, ReturnType<typeof vi.fn>> = { removeByAccounts: vi.fn().mockResolvedValue(4) };
    const imports: Record<string, ReturnType<typeof vi.fn>> = { removeByAccounts: vi.fn().mockResolvedValue(undefined) };
    const service: FinancialAccountService = new FinancialAccountService(
        accounts as unknown as FinancialAccountDomain,
        transactions as unknown as TransactionDomain,
        imports as unknown as TransactionImportDomain
    );
    return { service, accounts, transactions, imports };
}

beforeEach(() => {
    TransactionalContext.set({ withTransaction: async <T>(fn: () => Promise<T>): Promise<T> => fn() } as unknown as DatabaseClient);
});

describe('FinancialAccountService', () => {
    it('cria e atualiza contas pelo domínio', async () => {
        const { service, accounts } = build();

        const provider = await service.upsertProviderAccount({
            provider: 'pluggy',
            externalId: 'x',
            kind: 'checking',
            name: 'Itaú',
            currency: 'BRL'
        });
        const file = await service.createFileAccount({ kind: 'checking', name: 'Extrato', currency: 'BRL' });

        expect(provider.id).toBe('p');
        expect(file.id).toBe('f');
        expect(accounts['upsertProvider']).toHaveBeenCalled();
        expect(accounts['createFile']).toHaveBeenCalled();
        await expect(service.requireById('p')).resolves.toMatchObject({ id: 'p' });
    });

    it('removeProviderAccounts apaga transações, lotes e só as contas da Pluggy', async () => {
        const { service, accounts, transactions, imports } = build();

        const removed: number = await service.removeProviderAccounts(['p', 'f']);

        expect(removed).toBe(1);
        expect(transactions['removeByAccounts']).toHaveBeenCalledWith(['p']);
        expect(imports['removeByAccounts']).toHaveBeenCalledWith(['p']);
        expect(accounts['removeMany']).toHaveBeenCalledWith(['p']);
    });

    it('removeFileAccount apaga a conta de arquivo com as transações e os lotes', async () => {
        const { service, accounts, transactions, imports } = build();

        await service.removeFileAccount('f');

        expect(transactions['removeByAccounts']).toHaveBeenCalledWith(['f']);
        expect(imports['removeByAccounts']).toHaveBeenCalledWith(['f']);
        expect(accounts['removeMany']).toHaveBeenCalledWith(['f']);
    });

    it('removeFileAccount recusa conta que vem de uma conexão e não apaga nada', async () => {
        const { service, transactions } = build();

        await expect(service.removeFileAccount('p')).rejects.toMatchObject({ code: 'transactions.account_managed_by_connection' });
        expect(transactions['removeByAccounts']).not.toHaveBeenCalled();
    });
});
