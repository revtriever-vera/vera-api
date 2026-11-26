import { describe, expect, it, vi } from 'vitest';
import { BCB_CDI_DAILY, BCB_IPCA_MONTHLY } from '../../../../test/support/benchmark-fixtures';
import { IndexSeriesReaderService } from '../../fixed-income/services/index-series-reader.service';
import { MarketIndexReaderService, MarketIndexReading } from '../../market-data/services/market-index-reader.service';
import { BenchmarkService } from './benchmark.service';

const CDI = BCB_CDI_DAILY.map(([date, value]) => ({ date, value }));
const IPCA = BCB_IPCA_MONTHLY.map(([date, value]) => ({ date, value }));
const SELIC = [{ date: '2025-12-30', value: '15.00' }];

function build(ibovespa: MarketIndexReading) {
    const series = {
        loadCdiSince: vi.fn().mockResolvedValue(CDI),
        loadIpcaSince: vi.fn().mockResolvedValue(IPCA),
        loadSelicTargetSince: vi.fn().mockResolvedValue(SELIC)
    };
    const market = { ibovespaSince: vi.fn().mockResolvedValue(ibovespa) };
    const service = new BenchmarkService(series as unknown as IndexSeriesReaderService, market as unknown as MarketIndexReaderService);
    return { service, series, market };
}

describe('BenchmarkService', () => {
    it('junta CDI, IPCA, Selic meta e Ibovespa, cada um com a data até onde vai e a fonte', async () => {
        const { service, series, market } = build({
            state: 'ok',
            source: 'brapi',
            points: [
                { date: '2025-11-28', close: '150000' },
                { date: '2025-12-30', close: '160000' }
            ]
        });

        const result = await service.windows({ asOf: '2025-12-31' });

        expect(result.asOf).toBe('2025-12-31');
        expect(result.cdi).toMatchObject({ source: 'Banco Central, série 12', lastDate: '2025-12-31', stale: false });
        expect(result.cdi.windows.ytd).toBe(1432);
        expect(result.ipca).toMatchObject({ source: 'Banco Central, série 433', lastDate: '2025-12-01', stale: false });
        expect(result.ipca.windows.m12).toBe(426);
        expect(result.selicTarget).toEqual({ source: 'Banco Central, série 432', lastDate: '2025-12-30', stale: false, bps: 1500 });
        expect(result.ibovespa).toMatchObject({ state: 'ok', source: 'brapi', lastDate: '2025-12-30', stale: false });
        expect(result.ibovespa.windows.m1).toBe(667);
        expect(series.loadCdiSince).toHaveBeenCalledWith('2022-12-11');
        expect(market.ibovespaSince).toHaveBeenCalledWith('2022-12-11');
    });

    it('série atrasada diz até que data vai', async () => {
        const { service } = build({ state: 'ok', source: 'brapi', points: [{ date: '2025-12-10', close: '150000' }] });

        const result = await service.windows({ asOf: '2026-02-20' });

        expect(result.cdi.lastDate).toBe('2025-12-31');
        expect(result.cdi.stale).toBe(true);
        expect(result.ipca.lastDate).toBe('2025-12-01');
        expect(result.ipca.stale).toBe(false);
        expect(result.ibovespa.lastDate).toBe('2025-12-10');
        expect(result.ibovespa.stale).toBe(true);
        expect(result.selicTarget.stale).toBe(true);
    });

    it('Ibovespa sem token na fonte aparece como não configurado, sem erro e sem janelas', async () => {
        const { service } = build({ state: 'not_configured', source: 'brapi', points: [] });

        const result = await service.windows({ asOf: '2025-12-31' });

        expect(result.ibovespa).toMatchObject({ state: 'not_configured', lastDate: null, stale: true });
        expect(Object.values(result.ibovespa.windows).every((value) => value === null)).toBe(true);
        expect(result.cdi.windows.m1).toBe(122);
    });

    it('Ibovespa com pontos só depois da data de referência vira sem dados', async () => {
        const { service } = build({ state: 'ok', source: 'brapi', points: [{ date: '2026-01-05', close: '150000' }] });

        const result = await service.windows({ asOf: '2025-12-31' });

        expect(result.ibovespa.state).toBe('no_data');
    });
});
