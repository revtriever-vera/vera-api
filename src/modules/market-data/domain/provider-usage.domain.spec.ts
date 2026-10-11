import { describe, expect, it, vi } from 'vitest';
import { DatabaseClient } from '../../../core/database/database.client';
import { TransactionalContext } from '../../../core/database/using-transaction.decorator';
import { ProviderUsageRepository } from '../repositories/provider-usage.repository';
import { ProviderUsageDomain, windowStartOf } from './provider-usage.domain';

TransactionalContext.set({ withTransaction: async (fn: () => Promise<unknown>) => fn() } as unknown as DatabaseClient);

const NOW: Date = new Date('2026-10-09T15:42:31.500Z');

describe('windowStartOf', () => {
    it('truncates to the minute, the UTC day and the UTC month', () => {
        expect(windowStartOf('minute', NOW).toISOString()).toBe('2026-10-09T15:42:00.000Z');
        expect(windowStartOf('day', NOW).toISOString()).toBe('2026-10-09T00:00:00.000Z');
        expect(windowStartOf('month', NOW).toISOString()).toBe('2026-10-01T00:00:00.000Z');
    });

    it('opens a new window when the boundary is crossed', () => {
        expect(windowStartOf('minute', new Date('2026-10-09T15:43:00.000Z')).toISOString()).toBe('2026-10-09T15:43:00.000Z');
        expect(windowStartOf('day', new Date('2026-10-10T00:00:00.000Z')).toISOString()).toBe('2026-10-10T00:00:00.000Z');
    });
});

describe('ProviderUsageDomain.reserve', () => {
    it('reserves every configured window and reports the usage', async () => {
        const tryIncrement: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValueOnce(3).mockResolvedValueOnce(40);
        const domain: ProviderUsageDomain = new ProviderUsageDomain({ tryIncrement } as unknown as ProviderUsageRepository);

        const readings = await domain.reserve('coingecko', 2, { minute: 20, month: 9000 }, NOW);

        expect(readings).toEqual([
            { window: 'minute', used: 3, limit: 20 },
            { window: 'month', used: 40, limit: 9000 }
        ]);
        expect(tryIncrement).toHaveBeenNthCalledWith(
            1,
            { provider: 'coingecko', windowKind: 'minute', windowStart: windowStartOf('minute', NOW) },
            2,
            20
        );
    });

    it('refuses when any window is over its cap', async () => {
        const tryIncrement: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValueOnce(3).mockResolvedValueOnce(null);
        const domain: ProviderUsageDomain = new ProviderUsageDomain({ tryIncrement } as unknown as ProviderUsageRepository);

        expect(await domain.reserve('coingecko', 1, { minute: 20, month: 9000 }, NOW)).toBeNull();
    });

    it('refuses a request larger than the cap without touching the database', async () => {
        const tryIncrement: ReturnType<typeof vi.fn> = vi.fn();
        const domain: ProviderUsageDomain = new ProviderUsageDomain({ tryIncrement } as unknown as ProviderUsageRepository);

        expect(await domain.reserve('finnhub', 51, { minute: 50 }, NOW)).toBeNull();
        expect(tryIncrement).not.toHaveBeenCalled();
    });

    it('lets a provider without limits through', async () => {
        const domain: ProviderUsageDomain = new ProviderUsageDomain({ tryIncrement: vi.fn() } as unknown as ProviderUsageRepository);

        expect(await domain.reserve('tesouro', 1, {}, NOW)).toEqual([]);
    });

    it('propagates unexpected errors', async () => {
        const domain: ProviderUsageDomain = new ProviderUsageDomain({
            tryIncrement: vi.fn().mockRejectedValue(new Error('db down'))
        } as unknown as ProviderUsageRepository);

        await expect(domain.reserve('finnhub', 1, { minute: 50 }, NOW)).rejects.toThrow('db down');
    });

    it('prunes rows older than the retention window', async () => {
        const pruneBefore: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(4);
        const domain: ProviderUsageDomain = new ProviderUsageDomain({ pruneBefore } as unknown as ProviderUsageRepository);

        expect(await domain.pruneOld(NOW)).toBe(4);
        expect((pruneBefore.mock.calls[0] as [Date])[0].toISOString()).toBe('2026-08-30T15:42:31.500Z');
    });
});
