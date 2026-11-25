import { describe, expect, it, vi } from 'vitest';
import { parseMarketDataConfig } from '../config/market-data.config';
import { MarketIndexDomain } from '../domain/market-index.domain';
import { MarketIndexSourcePort } from '../ports/market-index-source.port';
import { MarketDataLogService } from './market-data-log.service';
import { MarketDataMetricsService } from './market-data-metrics.service';
import { MarketIndexSyncService } from './market-index-sync.service';
import { ProviderBudgetService } from './provider-budget.service';

const NOW: Date = new Date('2026-11-25T12:00:00Z');

function build(
    options: { configured?: boolean; last?: string | null; budget?: boolean; fetch?: () => Promise<unknown>; range?: string } = {}
) {
    const fetchDaily = vi.fn().mockImplementation(
        options.fetch ??
            (() =>
                Promise.resolve([
                    { date: '2026-11-23', close: '165000' },
                    { date: '2026-11-24', close: '166000' },
                    { date: '2026-11-25', close: '167000' }
                ]))
    );
    const source = { source: 'brapi', configured: options.configured ?? true, fetchDaily } as unknown as MarketIndexSourcePort;
    const save = vi.fn().mockImplementation((_symbol: string, _source: string, points: unknown[]) => Promise.resolve(points.length));
    const lastDate = vi
        .fn()
        .mockResolvedValueOnce(options.last ?? null)
        .mockResolvedValue('2026-11-24');
    const reserve = vi.fn().mockResolvedValue(options.budget ?? true);
    const logs = { indexStored: vi.fn(), indexNotConfigured: vi.fn(), indexFailed: vi.fn() };
    const metrics = { indexAge: vi.fn() };
    const config = parseMarketDataConfig(options.range === undefined ? {} : { BRAPI_INDEX_HISTORY_RANGE: options.range });
    const service = new MarketIndexSyncService(
        config,
        source,
        { save, lastDate } as unknown as MarketIndexDomain,
        { reserve } as unknown as ProviderBudgetService,
        logs as unknown as MarketDataLogService,
        metrics as unknown as MarketDataMetricsService
    );
    return { service, fetchDaily, save, reserve, logs, metrics };
}

describe('MarketIndexSyncService', () => {
    it('primeira rodada pede o histórico configurado, guarda só fechamentos de dias já encerrados e mede a idade', async () => {
        const { service, fetchDaily, save, reserve, logs, metrics } = build({ range: '1y' });

        await service.syncAll(NOW);

        expect(reserve).toHaveBeenCalledWith('brapi', 1, NOW);
        expect(fetchDaily).toHaveBeenCalledWith('^BVSP', '1y');
        expect(save).toHaveBeenCalledWith('^BVSP', 'brapi', [
            { date: '2026-11-23', close: '165000' },
            { date: '2026-11-24', close: '166000' }
        ]);
        expect(logs.indexStored).toHaveBeenCalledWith('^BVSP', '1y', 2);
        expect(metrics.indexAge).toHaveBeenCalledWith('^BVSP', 1);
    });

    it('padrão do plano gratuito: 3mo na primeira rodada', async () => {
        const { service, fetchDaily } = build();

        await service.syncAll(NOW);

        expect(fetchDaily).toHaveBeenCalledWith('^BVSP', '3mo');
    });

    it('com o histórico em dia pede só o último mês', async () => {
        const { service, fetchDaily } = build({ last: '2026-11-20', range: '10y' });

        await service.syncAll(NOW);

        expect(fetchDaily).toHaveBeenCalledWith('^BVSP', '1mo');
    });

    it('com um buraco maior que o último mês volta a pedir o histórico configurado', async () => {
        const { service, fetchDaily } = build({ last: '2026-09-01', range: '10y' });

        await service.syncAll(NOW);

        expect(fetchDaily).toHaveBeenCalledWith('^BVSP', '10y');
    });

    it('sem token registra e sai sem pedir orçamento nem chamar a brapi', async () => {
        const { service, fetchDaily, reserve, logs } = build({ configured: false });

        await service.syncAll(NOW);

        expect(logs.indexNotConfigured).toHaveBeenCalledWith('^BVSP');
        expect(reserve).not.toHaveBeenCalled();
        expect(fetchDaily).not.toHaveBeenCalled();
    });

    it('orçamento esgotado não chama a brapi', async () => {
        const { service, fetchDaily, save } = build({ budget: false });

        await service.syncAll(NOW);

        expect(fetchDaily).not.toHaveBeenCalled();
        expect(save).not.toHaveBeenCalled();
    });

    it('falha da brapi é registrada e não derruba o job diário', async () => {
        const { service, save, logs } = build({ fetch: () => Promise.reject(new Error('indisponível')) });

        await expect(service.syncAll(NOW)).resolves.toBeUndefined();

        expect(logs.indexFailed).toHaveBeenCalledWith('^BVSP', expect.any(Error));
        expect(save).not.toHaveBeenCalled();
    });
});
