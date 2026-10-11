import { describe, expect, it, vi } from 'vitest';
import { parseMarketDataConfig } from '../config/market-data.config';
import { ProviderUsageDomain } from '../domain/provider-usage.domain';
import { MarketDataLogService } from './market-data-log.service';
import { MarketDataMetricsService } from './market-data-metrics.service';
import { ProviderBudgetService } from './provider-budget.service';

function rig(reserve: ReturnType<typeof vi.fn>): {
    service: ProviderBudgetService;
    budgetUsed: ReturnType<typeof vi.fn>;
    refused: ReturnType<typeof vi.fn>;
} {
    const budgetUsed: ReturnType<typeof vi.fn> = vi.fn();
    const refused: ReturnType<typeof vi.fn> = vi.fn();
    const service: ProviderBudgetService = new ProviderBudgetService(
        parseMarketDataConfig({ FINNHUB_LIMIT_MINUTE: '10' }),
        { reserve, pruneOld: vi.fn().mockResolvedValue(0) } as unknown as ProviderUsageDomain,
        { budgetRefused: refused } as unknown as MarketDataLogService,
        { budgetUsed } as unknown as MarketDataMetricsService
    );
    return { service, budgetUsed, refused };
}

describe('ProviderBudgetService', () => {
    it('grants a reservation within the limits and exposes the used ratio', async () => {
        const reserve: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue([{ window: 'minute', used: 5, limit: 10 }]);
        const { service, budgetUsed } = rig(reserve);

        expect(await service.reserve('finnhub', 1)).toBe(true);
        expect(reserve).toHaveBeenCalledWith('finnhub', 1, { minute: 10 }, expect.any(Date));
        expect(budgetUsed).toHaveBeenCalledWith('finnhub', 'minute', 0.5);
    });

    it('refuses and logs when the domain refuses', async () => {
        const { service, refused, budgetUsed } = rig(vi.fn().mockResolvedValue(null));

        expect(await service.reserve('finnhub', 3)).toBe(false);
        expect(refused).toHaveBeenCalledWith('finnhub', 3);
        expect(budgetUsed).not.toHaveBeenCalled();
    });

    it('prunes old usage through the domain', async () => {
        const { service } = rig(vi.fn());

        await expect(service.pruneOldUsage()).resolves.toBeUndefined();
    });
});
