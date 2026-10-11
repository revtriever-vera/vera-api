import { describe, expect, it, vi } from 'vitest';
import { makeFinancialAccount, makeTransaction } from '../../../../test/support/spending-factories';
import { FinancialAccountDomain } from '../domain/financial-account.domain';
import { TransactionDomain } from '../domain/transaction.domain';
import { Transaction, TransactionFilter } from '../domain/transactions.types';
import { TransactionReaderService } from './transaction-reader.service';

const FILTER: TransactionFilter = { fromDate: '2026-09-01', toDate: '2026-09-30' };

async function collect(service: TransactionReaderService): Promise<number[]> {
    const sizes: number[] = [];
    for await (const page of service.pagesForExport(FILTER)) {
        sizes.push(page.length);
    }
    return sizes;
}

describe('TransactionReaderService.pagesForExport', () => {
    it('devolve páginas de 1.000 com cursor pela data e id da última linha, e a última página curta encerra', async () => {
        const full: Transaction[] = Array.from({ length: 1000 }, (_, index: number) =>
            makeTransaction({ id: `id-${String(index)}`, accountId: 'a1' })
        );
        const listAfter: ReturnType<typeof vi.fn> = vi
            .fn()
            .mockResolvedValueOnce(full)
            .mockResolvedValueOnce([makeTransaction({ accountId: 'a1' })]);
        const service: TransactionReaderService = new TransactionReaderService(
            { listAfter } as unknown as TransactionDomain,
            {
                findByIds: vi.fn().mockResolvedValue([makeFinancialAccount({ id: 'a1', name: 'Itaú' })])
            } as unknown as FinancialAccountDomain
        );

        const sizes: number[] = await collect(service);

        expect(sizes).toEqual([1000, 1]);
        expect(listAfter).toHaveBeenNthCalledWith(1, FILTER, null, 1000);
        expect(listAfter).toHaveBeenNthCalledWith(2, FILTER, { date: '2026-09-10', id: 'id-999' }, 1000);
    });

    it('traz o nome da conta e a visão de exportação de cada linha', async () => {
        const row: Transaction = makeTransaction({
            accountId: 'a1',
            amountMinor: '-1234',
            counterpartyName: 'Maria',
            categorySource: 'user'
        });
        const service: TransactionReaderService = new TransactionReaderService(
            { listAfter: vi.fn().mockResolvedValueOnce([row]) } as unknown as TransactionDomain,
            {
                findByIds: vi.fn().mockResolvedValue([makeFinancialAccount({ id: 'a1', name: 'Itaú' })])
            } as unknown as FinancialAccountDomain
        );

        const pages = [];
        for await (const page of service.pagesForExport(FILTER)) {
            pages.push(page);
        }

        expect(pages[0]?.[0]).toMatchObject({
            accountName: 'Itaú',
            amountMinor: -1234,
            counterpartyName: 'Maria',
            categorySource: 'user',
            date: '2026-09-10'
        });
    });

    it('sem linhas não devolve página', async () => {
        const service: TransactionReaderService = new TransactionReaderService(
            { listAfter: vi.fn().mockResolvedValue([]) } as unknown as TransactionDomain,
            {} as unknown as FinancialAccountDomain
        );

        await expect(collect(service)).resolves.toEqual([]);
    });
});
