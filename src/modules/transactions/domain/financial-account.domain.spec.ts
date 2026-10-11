import { describe, expect, it, vi } from 'vitest';
import { makeFinancialAccount } from '../../../../test/support/spending-factories';
import { FinancialAccountsRepository } from '../repositories/financial-accounts.repository';
import { FinancialAccountDomain } from './financial-account.domain';

function build(
    count: number = 0,
    found: unknown = makeFinancialAccount({ id: 'a1' })
): { domain: FinancialAccountDomain; repo: Record<string, ReturnType<typeof vi.fn>> } {
    const repo: Record<string, ReturnType<typeof vi.fn>> = {
        countActive: vi.fn().mockResolvedValue(count),
        create: vi.fn().mockImplementation((data: object) => Promise.resolve(makeFinancialAccount({ ...data }))),
        upsertProvider: vi.fn().mockImplementation((data: object) => Promise.resolve(makeFinancialAccount({ ...data }))),
        findById: vi.fn().mockResolvedValue(found),
        lockById: vi.fn().mockResolvedValue(found),
        rename: vi.fn().mockResolvedValue(found),
        findByIds: vi.fn().mockResolvedValue([]),
        listAll: vi.fn().mockResolvedValue([]),
        softDeleteMany: vi.fn().mockResolvedValue([makeFinancialAccount()])
    };
    return { domain: new FinancialAccountDomain(repo as unknown as FinancialAccountsRepository), repo };
}

describe('FinancialAccountDomain', () => {
    it('cria conta de arquivo sem provedor e com padrões', async () => {
        const { domain, repo } = build();

        await domain.createFile({ kind: 'checking', name: 'Extrato', currency: 'BRL' });

        expect(repo['create']).toHaveBeenCalledWith({
            kind: 'checking',
            name: 'Extrato',
            institutionName: null,
            numberLast4: null,
            currency: 'BRL',
            isSample: false
        });
    });

    it('cria ou atualiza conta da Pluggy pelo id externo', async () => {
        const { domain, repo } = build();

        await domain.upsertProvider({
            provider: 'pluggy',
            externalId: 'x',
            kind: 'credit_card',
            name: 'Cartão',
            numberLast4: '4321',
            currency: 'BRL'
        });

        expect(repo['upsertProvider']).toHaveBeenCalledWith(
            expect.objectContaining({ provider: 'pluggy', externalId: 'x', numberLast4: '4321', institutionName: null })
        );
    });

    it('recusa a 31ª conta', async () => {
        const { domain } = build(30);

        await expect(domain.createFile({ kind: 'other', name: 'X', currency: 'BRL' })).rejects.toMatchObject({
            code: 'transactions.limit_reached'
        });
        await expect(
            domain.upsertProvider({ provider: 'pluggy', externalId: 'x', kind: 'other', name: 'X', currency: 'BRL' })
        ).rejects.toMatchObject({ code: 'transactions.limit_reached' });
    });

    it('require, lock e rename levantam 404 quando a conta não existe', async () => {
        const { domain } = build(0, null);

        await expect(domain.require('x')).rejects.toMatchObject({ code: 'transactions.account_not_found' });
        await expect(domain.lock('x')).rejects.toMatchObject({ code: 'transactions.account_not_found' });
        await expect(domain.rename('x', 'Novo')).rejects.toMatchObject({ code: 'transactions.account_not_found' });
    });

    it('devolve a conta quando existe e remove em lote só com ids', async () => {
        const { domain, repo } = build();

        await expect(domain.require('a1')).resolves.toMatchObject({ id: 'a1' });
        await expect(domain.lock('a1')).resolves.toMatchObject({ id: 'a1' });
        await expect(domain.rename('a1', 'Novo')).resolves.toMatchObject({ id: 'a1' });
        await expect(domain.removeMany([])).resolves.toEqual([]);
        await expect(domain.removeMany(['a1'])).resolves.toHaveLength(1);
        await domain.findByIds(['a1']);
        await domain.listAll();
        expect(repo['softDeleteMany']).toHaveBeenCalledTimes(1);
    });
});
