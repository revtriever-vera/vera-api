import { describe, expect, it, vi } from 'vitest';
import { makeFinancialAccount, makeTransaction } from '../../../../test/support/spending-factories';
import { CompanyTimezoneService } from '../../identity/services/company-timezone.service';
import { FinancialAccountDomain } from '../domain/financial-account.domain';
import { TransactionDomain } from '../domain/transaction.domain';
import { TransactionViewService } from '../services/transaction-view.service';
import { TransactionsRecurringService } from '../services/transactions-recurring.service';
import { TransactionListApplication } from './transaction-list.application';

function build(marked: readonly string[] = []): {
    application: TransactionListApplication;
    domain: Record<string, ReturnType<typeof vi.fn>>;
} {
    const domain: Record<string, ReturnType<typeof vi.fn>> = {
        listPage: vi
            .fn()
            .mockResolvedValue([makeTransaction({ id: 't1', accountId: 'a1' }), makeTransaction({ id: 't2', accountId: 'a1' })]),
        totals: vi.fn().mockResolvedValue({ inMinor: 0, outMinor: -10000, count: 5 }),
        countUncategorizedOutgoing: vi.fn().mockResolvedValue(7)
    };
    const application: TransactionListApplication = new TransactionListApplication(
        domain as unknown as TransactionDomain,
        { todayInCompany: vi.fn().mockResolvedValue('2026-10-11') } as unknown as CompanyTimezoneService,
        {
            normalize: (text: string): string =>
                text
                    .toUpperCase()
                    .replace(/\d{4,}/g, '')
                    .trim()
        },
        new TransactionViewService(
            {
                findByIds: vi.fn().mockResolvedValue([makeFinancialAccount({ id: 'a1', name: 'Itaú' })])
            } as unknown as FinancialAccountDomain,
            { markedIn: vi.fn().mockResolvedValue(new Set<string>(marked)) } as unknown as TransactionsRecurringService
        )
    );
    return { application, domain };
}

describe('TransactionListApplication', () => {
    it('marca como recorrente só a transação de série confirmada, apontada pela porta', async () => {
        const { application } = build(['t2']);

        const view = await application.list({ page: 1, pageSize: 50 });

        expect(view.data.map((item) => [item.id, item.accountName, item.isRecurring])).toEqual([
            ['t1', 'Itaú', false],
            ['t2', 'Itaú', true]
        ]);
    });

    it('sem período lista o mês corrente da company', async () => {
        const { application, domain } = build();

        await application.list({ page: 1, pageSize: 50 });

        expect(domain['listPage']).toHaveBeenCalledWith(
            expect.objectContaining({ fromDate: '2026-10-01', toDate: '2026-10-31', uncategorized: false, search: undefined }),
            1,
            50
        );
    });

    it('month vira o primeiro e o último dia e from/to valem como estão', async () => {
        const { application, domain } = build();

        await application.list({ month: '2026-02', page: 1, pageSize: 50 });
        await application.list({ from: '2026-01-05', to: '2026-03-20', page: 1, pageSize: 50 });

        expect(domain['totals']).toHaveBeenNthCalledWith(1, expect.objectContaining({ fromDate: '2026-02-01', toDate: '2026-02-28' }));
        expect(domain['totals']).toHaveBeenNthCalledWith(2, expect.objectContaining({ fromDate: '2026-01-05', toDate: '2026-03-20' }));
    });

    it('repassa os filtros, normaliza a busca e usa o texto cru quando a normalização esvazia', async () => {
        const { application, domain } = build();

        await application.list({
            month: '2026-09',
            accountId: 'a1',
            categoryId: 'c1',
            uncategorized: 'true',
            direction: 'out',
            q: 'padaria',
            page: 2,
            pageSize: 10
        });
        await application.list({ month: '2026-09', q: '12345678', page: 1, pageSize: 10 });

        expect(domain['listPage']).toHaveBeenNthCalledWith(
            1,
            {
                fromDate: '2026-09-01',
                toDate: '2026-09-30',
                accountId: 'a1',
                categoryId: 'c1',
                uncategorized: true,
                direction: 'out',
                search: 'PADARIA'
            },
            2,
            10
        );
        expect(domain['listPage']).toHaveBeenNthCalledWith(2, expect.objectContaining({ search: '12345678' }), 1, 10);
    });

    it('devolve a página com visão pública, paginação e os totais da consulta inteira', async () => {
        const { application } = build();

        const page = await application.list({ month: '2026-09', page: 1, pageSize: 2 });

        expect(page.data).toHaveLength(2);
        expect(page.data[0]).toMatchObject({ accountName: 'Itaú' });
        expect(page.pagination).toEqual({ page: 1, pageSize: 2, totalRecords: 5, totalPages: 3 });
        expect(page.totals).toEqual({ inMinor: 0, outMinor: -10000, count: 5 });
    });

    it('página vazia não consulta contas', async () => {
        const { application, domain } = build();
        domain['listPage']?.mockResolvedValue([]);
        domain['totals']?.mockResolvedValue({ inMinor: 0, outMinor: 0, count: 0 });

        const page = await application.list({ month: '2026-09', page: 1, pageSize: 50 });

        expect(page).toMatchObject({ data: [], pagination: { totalPages: 0 } });
    });

    it('conta as saídas sem categoria', async () => {
        const { application } = build();

        await expect(application.uncategorizedCount()).resolves.toEqual({ count: 7 });
    });
});
