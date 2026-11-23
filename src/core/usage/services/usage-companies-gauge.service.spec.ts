import { describe, expect, it, vi } from 'vitest';
import { ContextHolder } from '../../context/as-company.decorator';
import { AppContext } from '../../context/app-context.port';
import { PaidUsageHistoryService } from './paid-usage-history.service';
import { PaidUsageMeter } from './paid-usage-meter.service';
import { UsageCompaniesGaugeService } from './usage-companies-gauge.service';
import { UsageMetricsService } from './usage-metrics.service';

describe('UsageCompaniesGaugeService', () => {
    it('conta as companies por estado e zera os estados sem ninguém', async () => {
        const context = {
            get: vi.fn().mockReturnValue({ requestId: 'r' }),
            run: vi.fn(async (_data: unknown, fn: () => Promise<unknown>) => fn())
        };
        ContextHolder.set(context as unknown as AppContext);
        const states: string[] = ['paused', 'ok', 'paused'];
        const history = { companiesWithUsage: vi.fn().mockResolvedValue([{ companyId: 'a' }, { companyId: 'b' }, { companyId: 'c' }]) };
        const meter = { state: vi.fn().mockImplementation(async () => Promise.resolve({ state: states.shift() })) };
        const companies = vi.fn();
        const service: UsageCompaniesGaugeService = new UsageCompaniesGaugeService(
            history as unknown as PaidUsageHistoryService,
            meter as unknown as PaidUsageMeter,
            { companies } as unknown as UsageMetricsService
        );

        await service.publish(new Date('2026-11-15T12:00:00.000Z'));

        expect(history.companiesWithUsage).toHaveBeenCalledWith('2026-11');
        expect(companies).toHaveBeenCalledWith('ok', 1);
        expect(companies).toHaveBeenCalledWith('warning', 0);
        expect(companies).toHaveBeenCalledWith('paused', 2);
    });
});
