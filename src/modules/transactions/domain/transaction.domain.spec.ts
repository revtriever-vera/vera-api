import { describe, expect, it, vi } from 'vitest';
import { makeTransaction } from '../../../../test/support/spending-factories';
import { TransactionsRepository } from '../repositories/transactions.repository';
import { TransactionDomain } from './transaction.domain';

function build(
    count: number = 0,
    found: unknown = makeTransaction({ id: 't1' })
): { domain: TransactionDomain; repo: Record<string, ReturnType<typeof vi.fn>> } {
    const names: string[] = [
        'findByExternalIds',
        'findAbsorbing',
        'listUnabsorbedProviderRows',
        'listFileRows',
        'insertManyIfAbsent',
        'markSuperseded',
        'markAbsorbed',
        'listPage',
        'listAfter',
        'totals',
        'countUncategorizedOutgoing',
        'statsByAccount',
        'monthlyNetByCategory',
        'monthsWithData',
        'countOtherCurrencies',
        'softDeleteByAccounts',
        'softDeleteByImport',
        'clearAbsorbedByImport',
        'selectBatch',
        'countSelection',
        'applyOutcome',
        'moveCategory'
    ];
    const repo: Record<string, ReturnType<typeof vi.fn>> = Object.fromEntries(
        names.map((name: string) => [name, vi.fn().mockResolvedValue(1)])
    );
    repo['countActive'] = vi.fn().mockResolvedValue(count);
    repo['findById'] = vi.fn().mockResolvedValue(found);
    repo['patch'] = vi.fn().mockResolvedValue(found);
    repo['newId'] = vi.fn().mockReturnValue('new-id');
    return { domain: new TransactionDomain(repo as unknown as TransactionsRepository), repo };
}

describe('TransactionDomain', () => {
    it('require e patch levantam 404 quando a transação não existe', async () => {
        const { domain } = build(0, null);

        await expect(domain.require('x')).rejects.toMatchObject({ code: 'transactions.transaction_not_found' });
        await expect(domain.patch('x', {})).rejects.toMatchObject({ code: 'transactions.transaction_not_found' });
    });

    it('devolve a transação existente e gera ids', async () => {
        const { domain } = build();

        await expect(domain.require('t1')).resolves.toMatchObject({ id: 't1' });
        await expect(domain.patch('t1', {})).resolves.toMatchObject({ id: 't1' });
        expect(domain.newId()).toBe('new-id');
    });

    it('confere o teto de 200 mil transações só quando há linhas a inserir', async () => {
        const full = build(199_990);
        const empty = build(500_000);

        await expect(full.domain.assertRoomFor(10)).resolves.toBeUndefined();
        await expect(full.domain.assertRoomFor(11)).rejects.toMatchObject({ code: 'transactions.limit_reached' });
        await expect(empty.domain.assertRoomFor(0)).resolves.toBeUndefined();
        expect(empty.repo['countActive']).not.toHaveBeenCalled();
    });

    it('alarga a janela de busca entre fontes em um dia para cada lado', async () => {
        const { domain, repo } = build();

        await domain.unabsorbedProviderRows('a', '2026-09-10', '2026-09-30');
        await domain.fileRows('a', '2026-09-01', '2026-10-01');

        expect(repo['listUnabsorbedProviderRows']).toHaveBeenCalledWith('a', '2026-09-09', '2026-10-01');
        expect(repo['listFileRows']).toHaveBeenCalledWith('a', '2026-08-31', '2026-10-02');
    });

    it('não toca o banco para listas vazias de contas ou ids', async () => {
        const { domain, repo } = build();

        await expect(domain.removeByAccounts([])).resolves.toBe(0);
        await expect(domain.applyOutcome([], { categoryId: null, source: 'none', ruleId: null })).resolves.toBe(0);
        await expect(domain.moveCategory([], 'c')).resolves.toBe(0);
        expect(repo['softDeleteByAccounts']).not.toHaveBeenCalled();
        expect(repo['applyOutcome']).not.toHaveBeenCalled();
        expect(repo['moveCategory']).not.toHaveBeenCalled();
    });

    it('delega as demais operações ao repositório', async () => {
        const { domain, repo } = build();
        const filter = { fromDate: '2026-09-01', toDate: '2026-09-30' };

        await domain.findByExternalIds('a', ['x']);
        await domain.findAbsorbing('a', ['x']);
        await domain.insertMany([]);
        await domain.markSuperseded('f', 'p');
        await domain.markAbsorbed('p', 'ofx:1', null);
        await domain.listPage(filter, 1, 50);
        await domain.listAfter(filter, null, 1000);
        await domain.totals(filter);
        await domain.countUncategorizedOutgoing();
        await domain.statsByAccount(['a']);
        await domain.statsByAccount([]);
        await domain.monthlyNetByCategory({ fromMonth: '2026-09', toMonth: '2026-09' });
        await domain.monthsWithData({ fromMonth: '2026-09', toMonth: '2026-09' });
        await domain.countOtherCurrencies('2026-09');
        await domain.removeByAccounts(['a']);
        await domain.removeByImport('i');
        await domain.releaseAbsorbedByImport('i');
        await domain.selectBatch({ kind: 'rule', ruleId: 'r' }, null, 10, false);
        await domain.countSelection({ kind: 'rule', ruleId: 'r' }, false);
        await domain.applyOutcome(['t'], { categoryId: 'c', source: 'rule', ruleId: 'r' });
        await domain.moveCategory(['t'], 'c');

        expect(repo['statsByAccount']).toHaveBeenCalledTimes(2);
        expect(repo['clearAbsorbedByImport']).toHaveBeenCalledWith('i');
        expect(repo['applyOutcome']).toHaveBeenCalledWith(['t'], { categoryId: 'c', source: 'rule', ruleId: 'r' });
    });
});
