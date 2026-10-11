import { describe, expect, it, vi } from 'vitest';
import { TransactionDomain } from '../domain/transaction.domain';
import { TransactionAggregatesService } from './transaction-aggregates.service';

describe('TransactionAggregatesService', () => {
    it('delega as três leituras ao domínio', async () => {
        const domain: Record<string, ReturnType<typeof vi.fn>> = {
            monthlyNetByCategory: vi.fn().mockResolvedValue([{ month: '2026-09', categoryId: null, netMinor: -80000 }]),
            monthsWithData: vi.fn().mockResolvedValue(['2026-09']),
            countOtherCurrencies: vi.fn().mockResolvedValue(2)
        };
        const service: TransactionAggregatesService = new TransactionAggregatesService(domain as unknown as TransactionDomain);

        await expect(service.monthlyNetByCategory({ fromMonth: '2026-09', toMonth: '2026-09' })).resolves.toHaveLength(1);
        await expect(service.monthsWithData({ fromMonth: '2026-06', toMonth: '2026-09' })).resolves.toEqual(['2026-09']);
        await expect(service.excludedCurrencyCount('2026-09')).resolves.toBe(2);
        expect(domain['monthlyNetByCategory']).toHaveBeenCalledWith({ fromMonth: '2026-09', toMonth: '2026-09' });
    });
});
