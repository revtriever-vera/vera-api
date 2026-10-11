import { addDays, isWeekday } from '../../src/modules/fixed-income/domain/curve/business-days';
import { buildIpcaSeries } from '../../src/modules/fixed-income/domain/curve/ipca-factor';
import { buildCdiCurve } from '../../src/modules/fixed-income/domain/curve/business-days';
import { FixedIncomeTitle } from '../../src/modules/fixed-income/domain/fixed-income.types';
import { CurveSeries, CurveTerms, INDEXERS, SeriesPoint, TAX_REGIMES } from '../../src/modules/fixed-income/domain/curve/curve.types';

export function weekdayPoints(from: string, toInclusive: string, value: string, skip: readonly string[] = []): SeriesPoint[] {
    const points: SeriesPoint[] = [];
    for (let date: string = from; date <= toInclusive; date = addDays(date, 1)) {
        if (isWeekday(date) && !skip.includes(date)) {
            points.push({ date, value });
        }
    }
    return points;
}

export function seriesOf(cdi: readonly SeriesPoint[], ipca: readonly SeriesPoint[] = []): CurveSeries {
    return { cdi: buildCdiCurve(cdi), ipca: buildIpcaSeries(ipca) };
}

export function makeTerms(overrides: Partial<CurveTerms> = {}): CurveTerms {
    return {
        indexer: INDEXERS.cdiPercent,
        rateBps: 10000,
        currency: 'BRL',
        appliedMinor: 10_000_000,
        appliedAt: '2025-01-06',
        maturityDate: '2030-01-06',
        taxRegime: TAX_REGIMES.regressive,
        ...overrides
    };
}

export function makeTitle(overrides: Partial<FixedIncomeTitle> = {}): FixedIncomeTitle {
    return {
        id: 'title-1',
        kind: 'cdb',
        name: 'CDB Banco Exemplo',
        indexer: 'cdi_percent',
        rateBps: 11000,
        currency: 'BRL',
        appliedMinor: 10_000_000,
        appliedAt: '2025-01-06',
        maturityDate: '2030-01-06',
        taxRegime: 'regressive',
        createdAt: new Date('2025-01-06T12:00:00Z'),
        updatedAt: new Date('2025-01-06T12:00:00Z'),
        ...overrides
    };
}
