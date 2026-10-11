import { describe, expect, it, vi } from 'vitest';
import { makeTitle, seriesOf, weekdayPoints } from '../../../../test/support/fixed-income-fixtures';
import { CurveSeries } from '../domain/curve/curve.types';
import { FixedIncomeTitleDomain } from '../domain/fixed-income-title.domain';
import { TitleNotFoundError } from '../domain/fixed-income.errors';
import { IndexSeriesDomain } from '../domain/index-series.domain';
import { FixedIncomeLogService } from './fixed-income-log.service';
import { FixedIncomeMetricsService } from './fixed-income-metrics.service';
import { FixedIncomeValuationService } from './fixed-income-valuation.service';

const ASOF: Date = new Date('2025-03-03T15:00:00Z');

function build(series: CurveSeries, titles = [makeTitle()]) {
    const loadCurveSeries = vi.fn().mockResolvedValue(series);
    const valuationMetric = vi.fn();
    const missingLog = vi.fn();
    const service = new FixedIncomeValuationService(
        {
            listAll: vi.fn().mockResolvedValue(titles),
            findById: vi.fn().mockImplementation((id: string) => Promise.resolve(titles.find((title) => title.id === id) ?? null))
        } as unknown as FixedIncomeTitleDomain,
        { loadCurveSeries } as unknown as IndexSeriesDomain,
        { valuationMissingData: missingLog } as unknown as FixedIncomeLogService,
        { valuation: valuationMetric } as unknown as FixedIncomeMetricsService
    );
    return { service, loadCurveSeries, valuationMetric, missingLog };
}

describe('FixedIncomeValuationService', () => {
    const covered: CurveSeries = seriesOf(weekdayPoints('2025-01-06', '2025-03-02', '0.05'));

    it('valueAll carrega as séries uma vez só, para todos os títulos', async () => {
        const doubles = build(covered, [makeTitle({ id: 'a' }), makeTitle({ id: 'b', rateBps: 12000 })]);

        const valued = await doubles.service.valueAll(ASOF);

        expect(valued.map((entry) => entry.title.id)).toEqual(['a', 'b']);
        expect(valued[1]?.valuation.valueMinor).toBeGreaterThan(valued[0]?.valuation.valueMinor ?? 0);
        expect(doubles.loadCurveSeries).toHaveBeenCalledTimes(1);
        expect(doubles.valuationMetric).toHaveBeenCalledWith('ok', 2);
    });

    it('usa a data de São Paulo como referência', () => {
        expect(FixedIncomeValuationService.referenceDate(new Date('2025-03-03T01:00:00Z'))).toBe('2025-03-02');
    });

    it('valueOne devolve o título valorizado e falha quando não existe', async () => {
        const doubles = build(covered);

        expect((await doubles.service.valueOne('title-1', ASOF)).valuation.source).toBe('curve_cdi');
        await expect(doubles.service.valueOne('missing', ASOF)).rejects.toBeInstanceOf(TitleNotFoundError);
    });

    it('valueTitleNow valoriza um título já carregado', async () => {
        const doubles = build(covered);

        expect((await doubles.service.valueTitleNow(makeTitle(), ASOF)).status).toBe('ok');
    });

    it('sem dado de índice mede, avisa uma vez e devolve o valor aplicado', async () => {
        const doubles = build(seriesOf([]), [makeTitle({ id: 'a' }), makeTitle({ id: 'b' })]);

        const valued = await doubles.service.valueAll(ASOF);

        expect(valued.every((entry) => entry.valuation.status === 'index_data_missing')).toBe(true);
        expect(doubles.valuationMetric).toHaveBeenCalledWith('index_data_missing', 2);
        expect(doubles.missingLog).toHaveBeenCalledTimes(1);
        expect(doubles.missingLog).toHaveBeenCalledWith(2, null);
    });

    it('preview calcula o regime de imposto pelo tipo e não registra métrica', async () => {
        const doubles = build(covered);

        const valuation = await doubles.service.preview(
            {
                kind: 'lci',
                indexer: 'cdi_percent',
                rateBps: 9500,
                currency: 'BRL',
                appliedMinor: 10_000_000,
                appliedAt: '2025-01-06',
                maturityDate: '2027-01-06'
            },
            ASOF
        );

        expect(valuation).toMatchObject({ taxRegime: 'exempt', taxEstimatedMinor: 0, status: 'ok' });
        expect(doubles.valuationMetric).not.toHaveBeenCalled();
    });
});
