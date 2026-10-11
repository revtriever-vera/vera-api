import { describe, expect, it, vi } from 'vitest';
import { IndexSeriesPointsRepository } from '../repositories/index-series-points.repository';
import { IndexSeriesPointRow } from './fixed-income.types';
import { IndexSeriesDomain } from './index-series.domain';

function point(series: string, date: Date, value: string): IndexSeriesPointRow {
    return { series, date, value, source: 'mock', fetchedAt: new Date() };
}

function build(last: IndexSeriesPointRow | null = null) {
    const repository = {
        listSeries: vi
            .fn()
            .mockImplementation((series: string) =>
                Promise.resolve(
                    series === 'cdi_daily'
                        ? [point(series, new Date(2025, 0, 6), '0.05000000'), point(series, new Date(2025, 0, 7), '0.05000000')]
                        : [point(series, new Date(2025, 0, 1), '0.40000000')]
                )
            ),
        findLast: vi.fn().mockResolvedValue(last),
        upsertMany: vi.fn().mockResolvedValue(undefined)
    };
    return { domain: new IndexSeriesDomain(repository as unknown as IndexSeriesPointsRepository), repository };
}

describe('IndexSeriesDomain', () => {
    it('carrega as duas séries uma vez e monta a curva', async () => {
        const { domain, repository } = build();

        const series = await domain.loadCurveSeries();

        expect(series.cdi.dates).toEqual(['2025-01-06', '2025-01-07']);
        expect(series.ipca.months).toEqual(['2025-01']);
        expect(series.ipca.values[0]?.toString()).toBe('0.4');
        expect(repository.listSeries).toHaveBeenCalledTimes(2);
    });

    it('devolve a data do último ponto ou null', async () => {
        expect(await build(point('cdi_daily', new Date(2026, 9, 9), '0.05')).domain.lastPointDate('cdi_daily')).toBe('2026-10-09');
        expect(await build().domain.lastPointDate('cdi_daily')).toBeNull();
    });

    it('grava os pontos e devolve quantos eram', async () => {
        const { domain, repository } = build();
        const points = [{ date: '2026-10-09', value: '0.05' }];

        expect(await domain.savePoints('cdi_daily', 'bcb-sgs', points)).toBe(1);
        expect(repository.upsertMany).toHaveBeenCalledWith('cdi_daily', 'bcb-sgs', points);
    });
});
