import { describe, expect, it, vi } from 'vitest';
import { makeFinancialAccount } from '../../../../test/support/spending-factories';
import { FinancialAccountDomain } from '../domain/financial-account.domain';
import { TransactionDomain } from '../domain/transaction.domain';
import { FinancialAccountService } from '../services/financial-account.service';
import { AccountApplication } from './account.application';

function build(): { application: AccountApplication; removeFileAccount: ReturnType<typeof vi.fn>; rename: ReturnType<typeof vi.fn> } {
    const itau = makeFinancialAccount({ id: 'a1', name: 'Itaú', provider: 'pluggy', externalId: 'x' });
    const file = makeFinancialAccount({ id: 'a2', name: 'Extrato' });
    const rename: ReturnType<typeof vi.fn> = vi
        .fn()
        .mockImplementation((id: string, name: string) => Promise.resolve({ ...itau, id, name }));
    const removeFileAccount: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(undefined);
    const application: AccountApplication = new AccountApplication(
        { listAll: vi.fn().mockResolvedValue([itau, file]), rename } as unknown as FinancialAccountDomain,
        {
            statsByAccount: vi
                .fn()
                .mockImplementation((ids: string[]) =>
                    Promise.resolve(ids.includes('a1') ? [{ accountId: 'a1', transactionCount: 3, lastTransactionDate: '2026-09-30' }] : [])
                )
        } as unknown as TransactionDomain,
        { removeFileAccount } as unknown as FinancialAccountService
    );
    return { application, removeFileAccount, rename };
}

describe('AccountApplication', () => {
    it('lista as contas com contagem e última data, zerando as sem transação', async () => {
        const { application } = build();

        const listed = await application.list();

        expect(listed.accounts).toMatchObject([
            { id: 'a1', source: 'pluggy', transactionCount: 3, lastTransactionDate: '2026-09-30' },
            { id: 'a2', source: 'file', transactionCount: 0, lastTransactionDate: null }
        ]);
    });

    it('renomeia e devolve a visão com as estatísticas', async () => {
        const { application, rename } = build();

        const renamed = await application.rename('a1', 'Principal');

        expect(rename).toHaveBeenCalledWith('a1', 'Principal');
        expect(renamed).toMatchObject({ id: 'a1', name: 'Principal', transactionCount: 3 });
    });

    it('exclui pela regra do serviço de contas', async () => {
        const { application, removeFileAccount } = build();

        await application.remove('a2');

        expect(removeFileAccount).toHaveBeenCalledWith('a2');
    });
});
