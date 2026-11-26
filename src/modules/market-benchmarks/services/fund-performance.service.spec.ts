import { describe, expect, it, vi } from 'vitest';
import { AssetCatalogService } from '../../catalog/services/asset-catalog.service';
import { FundQuoteHistoryService } from '../../market-data/services/fund-quote-history.service';
import { BenchmarkService } from './benchmark.service';
import { FundPerformanceService } from './fund-performance.service';

const EMPTY = { m1: null, m3: null, m6: null, m12: null, m24: null, m36: null, ytd: null };
const POINTS = [
    { date: '2025-03-19', quota: '1.000000' },
    { date: '2025-09-19', quota: '1.060000' },
    { date: '2025-12-19', quota: '1.100000' },
    { date: '2026-02-19', quota: '1.150000' },
    { date: '2026-03-19', quota: '1.200000' }
];

function rig(options: { asset?: object | null; points?: typeof POINTS; complete?: boolean } = {}) {
    const history = vi.fn().mockResolvedValue({ points: options.points ?? POINTS, complete: options.complete ?? true });
    const windows = vi.fn().mockResolvedValue({
        cdi: { source: 'Banco Central, série 12', lastDate: '2026-03-19', stale: false, windows: { ...EMPTY, m1: 100, m3: 300, m12: 1000 } }
    });
    const asset =
        options.asset === undefined ? { id: 'f1', name: 'Fundo Alfa', market: 'CVM', externalId: '11111111000191' } : options.asset;
    const service = new FundPerformanceService(
        { findByMarketAndExternalId: vi.fn().mockResolvedValue(asset) } as unknown as AssetCatalogService,
        { history } as unknown as FundQuoteHistoryService,
        { windows } as unknown as BenchmarkService
    );
    return { service, history, windows };
}

describe('FundPerformanceService', () => {
    it('devolve a rentabilidade da cota, o CDI da mesma janela e a diferença já calculada', async () => {
        const { service, history, windows } = rig();

        const result = await service.performance({ fundKey: 'f1', windows: ['m1', 'm3', 'm12'], asOf: '2026-03-20' });

        expect(history).toHaveBeenCalledWith({ assetId: 'f1', seriesKey: '11111111000191' }, '2025-03-10', '2026-03-20');
        expect(windows).toHaveBeenCalledWith({ asOf: '2026-03-19' });
        expect(result).toMatchObject({
            state: 'ok',
            name: 'Fundo Alfa',
            lastDate: '2026-03-19',
            stale: false,
            complete: true,
            missing: []
        });
        expect(result.windows).toEqual({
            m1: { fundBps: 435, cdiBps: 100, differenceBps: 335 },
            m3: { fundBps: 909, cdiBps: 300, differenceBps: 609 },
            m12: { fundBps: 2000, cdiBps: 1000, differenceBps: 1000 }
        });
    });

    it('janela sem cota no começo entra em missing, e CDI sem histórico deixa a diferença em branco', async () => {
        const { service } = rig({ points: POINTS.slice(3) });

        const result = await service.performance({ fundKey: 'f1', windows: ['m1', 'm6'], asOf: '2026-03-20' });

        expect(result.missing).toEqual(['m6']);
        expect(result.windows.m1).toEqual({ fundBps: 435, cdiBps: 100, differenceBps: 335 });
        const noCdi = rig();
        const bare = await noCdi.service.performance({ fundKey: 'f1', windows: ['m6'], asOf: '2026-03-20' });
        expect(bare.windows.m6).toEqual({ fundBps: 1321, cdiBps: null, differenceBps: null });
    });

    it('cota velha demais marca o fundo como atrasado e histórico não baixado marca incompleto', async () => {
        const { service } = rig({ points: POINTS.slice(0, 4), complete: false });

        const result = await service.performance({ fundKey: 'f1', windows: ['m1'], asOf: '2026-03-30' });

        expect(result).toMatchObject({ lastDate: '2026-02-19', stale: true, complete: false });
    });

    it('fundo sem nenhuma cota e chave desconhecida têm estado próprio', async () => {
        const none = await rig({ points: [] }).service.performance({ fundKey: 'f1', asOf: '2026-03-20' });
        const unknown = await rig({ asset: null }).service.performance({ fundKey: 'x', asOf: '2026-03-20' });

        expect(none).toMatchObject({ state: 'no_data', name: 'Fundo Alfa', missing: ['m1', 'm3', 'm6', 'm12', 'm36'] });
        expect(unknown.state).toBe('not_found');
    });
});
