import { describe, expect, it, vi } from 'vitest';
import { IndexSeriesDomain } from '../domain/index-series.domain';
import { FixedIncomeLogService } from '../services/fixed-income-log.service';
import { FixedIncomeMetricsService } from '../services/fixed-income-metrics.service';
import { IndexSyncApplication, syncJobId } from './index-sync.application';

const NOW: Date = new Date('2026-10-11T15:00:00Z');

function build(lastDates: Record<string, string | null>, fetchImpl?: () => Promise<unknown>) {
    const publish = vi.fn().mockResolvedValue(undefined);
    const savePoints = vi.fn().mockImplementation((_series: string, _source: string, points: unknown[]) => Promise.resolve(points.length));
    const fetch = vi.fn().mockImplementation(fetchImpl ?? (() => Promise.resolve([{ date: '2026-10-09', value: '0.05' }])));
    const metrics = { sync: vi.fn(), indexAge: vi.fn() };
    const logs = { seriesSynced: vi.fn(), seriesSyncFailed: vi.fn(), syncRequested: vi.fn() };
    const application = new IndexSyncApplication(
        {
            lastPointDate: vi.fn().mockImplementation((series: string) => Promise.resolve(lastDates[series] ?? null)),
            savePoints
        } as unknown as IndexSeriesDomain,
        { source: 'mock', fetch },
        { publish },
        logs as unknown as FixedIncomeLogService,
        metrics as unknown as FixedIncomeMetricsService
    );
    return { application, publish, savePoints, fetch, metrics, logs };
}

describe('IndexSyncApplication', () => {
    it('primeira rodada: backfill desde 2010 em janelas de um ano, um job por série e janela', async () => {
        const doubles = build({});

        await doubles.application.requestSync(NOW);

        const payloads = doubles.publish.mock.calls.map((call) => call[2] as { series: string; from: string; to: string });
        const cdi = payloads.filter((payload) => payload.series === 'cdi_daily');
        const ipca = payloads.filter((payload) => payload.series === 'ipca_monthly');
        expect(cdi).toHaveLength(17);
        expect(ipca).toHaveLength(17);
        expect(cdi[0]).toEqual({ series: 'cdi_daily', from: '2010-01-01', to: '2010-12-31' });
        expect(cdi.at(-1)).toEqual({ series: 'cdi_daily', from: '2026-01-01', to: '2026-10-11' });
        expect(doubles.metrics.indexAge).not.toHaveBeenCalled();
    });

    it('rodadas seguintes: uma janela do último ponto até hoje, com jobId determinístico', async () => {
        const doubles = build({ cdi_daily: '2026-10-08', ipca_monthly: '2026-09-01' });

        await doubles.application.requestSync(NOW);
        await doubles.application.requestSync(NOW);

        expect(doubles.publish).toHaveBeenCalledTimes(4);
        const first = doubles.publish.mock.calls[0];
        expect(first?.[2]).toEqual({ series: 'cdi_daily', from: '2026-10-08', to: '2026-10-11' });
        expect(first?.[3]).toEqual({ jobId: 'fixed-income-index-sync-cdi-daily-2026-10-08-2026-10-11' });
        expect(doubles.publish.mock.calls[0]?.[3]).toEqual(doubles.publish.mock.calls[2]?.[3]);
        expect(doubles.metrics.indexAge).toHaveBeenCalledWith('cdi_daily', 3);
        expect(doubles.metrics.indexAge).toHaveBeenCalledWith('ipca_monthly', 40);
    });

    it('o jobId não tem dois-pontos', () => {
        expect(syncJobId({ series: 'ipca_monthly', from: '2026-01-01', to: '2026-10-11' })).not.toContain(':');
    });

    it('syncWindow busca, grava e mede', async () => {
        const doubles = build({});

        const saved = await doubles.application.syncWindow({ series: 'cdi_daily', from: '2026-10-08', to: '2026-10-11' });

        expect(saved).toBe(1);
        expect(doubles.fetch).toHaveBeenCalledWith('cdi_daily', '2026-10-08', '2026-10-11');
        expect(doubles.savePoints).toHaveBeenCalledWith('cdi_daily', 'mock', [{ date: '2026-10-09', value: '0.05' }]);
        expect(doubles.metrics.sync).toHaveBeenCalledWith('cdi_daily', 'success');
    });

    it('syncWindow registra a falha e deixa o job tentar de novo', async () => {
        const doubles = build({}, () => Promise.reject(new Error('indisponível')));

        await expect(doubles.application.syncWindow({ series: 'cdi_daily', from: '2026-10-08', to: '2026-10-11' })).rejects.toThrow(
            'indisponível'
        );

        expect(doubles.metrics.sync).toHaveBeenCalledWith('cdi_daily', 'failure');
        expect(doubles.logs.seriesSyncFailed).toHaveBeenCalled();
        expect(doubles.savePoints).not.toHaveBeenCalled();
    });
});
