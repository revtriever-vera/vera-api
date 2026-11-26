import { describe, expect, it, vi } from 'vitest';
import { RealRatesReaderService } from '../../fixed-income-schedule/services/real-rates-reader.service';
import { BenchmarkService } from './benchmark.service';
import { FixedIncomeBenchmarkService } from './fixed-income-benchmark.service';

const EMPTY = { m1: null, m3: null, m6: null, m12: null, m24: null, m36: null, ytd: null };
const WINDOWS = {
    cdi: { source: 'Banco Central, série 12', lastDate: '2026-03-19', windows: { ...EMPTY, m12: 1280 } },
    ipca: { source: 'Banco Central, série 433', lastDate: '2026-02-01', windows: { ...EMPTY, m12: 480 } }
};

function item(id: string, overrides: object = {}) {
    return {
        id,
        name: 'CDB do Banco X',
        kind: 'cdb',
        indexer: 'cdi_percent',
        rateBps: 11000,
        appliedMinor: 100000,
        appliedAt: '2025-06-10',
        valueMinor: 110000,
        nominalAnnualBps: 1408,
        realAnnualBps: 880,
        lowReal: false,
        correctedMinor: 104000,
        purchasingPowerGainMinor: 6000,
        purchasingPowerGainBps: 576,
        taxRegime: 'regressive',
        estimated: false,
        ...overrides
    };
}

function rig(items: object[], ipca12: object | null = {}) {
    return new FixedIncomeBenchmarkService(
        {
            readAll: vi.fn().mockResolvedValue({ asOf: '2026-03-20', rates: { ipca12m: ipca12 }, items })
        } as unknown as RealRatesReaderService,
        { windows: vi.fn().mockResolvedValue(WINDOWS) } as unknown as BenchmarkService
    );
}

describe('FixedIncomeBenchmarkService', () => {
    it('sem chave lista os títulos com a chave de cada um, sem o nome', async () => {
        const result = await rig([item('x1'), item('x2', { kind: 'lci' })]).compare({ asOf: '2026-03-20' });

        expect(result.state).toBe('list');
        expect(result.titles.map((title) => title.key)).toEqual(['rf1', 'rf2']);
        expect(JSON.stringify(result)).not.toContain('Banco X');
        expect(result.reference).toMatchObject({ cdi12Bps: 1280, ipca12Bps: 480, cdiLastDate: '2026-03-19', ipcaLastDate: '2026-02-01' });
    });

    it('com a chave devolve a comparação já calculada contra a inflação e o CDI', async () => {
        const result = await rig([item('rf1'), item('rf2', { realAnnualBps: -50, nominalAnnualBps: 1000 })]).compare({
            holdingKey: 'rf2',
            asOf: '2026-03-20'
        });

        expect(result.state).toBe('ok');
        expect(result.titles).toEqual([
            expect.objectContaining({ key: 'rf2', beatsInflation: false, versusCdiBps: -280, nominalAnnualBps: 1000, realAnnualBps: -50 })
        ]);
    });

    it('taxa real desconhecida não afirma nada sobre a inflação', async () => {
        const result = await rig([item('rf1', { realAnnualBps: null, nominalAnnualBps: null })]).compare({
            holdingKey: 'rf1',
            asOf: '2026-03-20'
        });

        expect(result.titles[0]).toMatchObject({ beatsInflation: null, versusCdiBps: null });
    });

    it('chave que não é da carteira, carteira sem renda fixa e índice faltando têm estado próprio', async () => {
        expect((await rig([item('rf1')]).compare({ holdingKey: 'zzz', asOf: '2026-03-20' })).state).toBe('not_found');
        expect((await rig([]).compare({ asOf: '2026-03-20' })).state).toBe('no_titles');
        expect((await rig([], null).compare({ asOf: '2026-03-20' })).state).toBe('no_index');
    });
});
