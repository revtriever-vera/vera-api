import { DecimalUtil } from '../../src/shared/utils/decimal.util';
import { CurveSeries, SeriesPoint } from '../../src/modules/fixed-income/domain/curve/curve.types';
import { ReferenceRates } from '../../src/modules/fixed-income/services/index-series-math';
import { ScheduleInputs, ScheduleTitle, ScheduleTreasury } from '../../src/modules/fixed-income-schedule/domain/schedule.types';
import { seriesOf } from './fixed-income-fixtures';

export const TODAY: string = '2026-01-05';
export const MATURITY_252_BUSINESS_DAYS: string = '2026-12-23';

export function makeRates(overrides: Partial<ReferenceRates> = {}): ReferenceRates {
    return {
        cdiAnnual: DecimalUtil.of('0.10'),
        cdiAnnualBps: 1000,
        cdiDate: '2026-01-02',
        ipca12m: DecimalUtil.of('0.04'),
        ipca12mBps: 400,
        ipcaMonth: '2025-12',
        ...overrides
    };
}

export function monthlyIpca(firstMonth: string, months: number, value: string): SeriesPoint[] {
    const [year, month]: number[] = firstMonth.split('-').map(Number) as [number, number];
    return Array.from({ length: months }, (_unused: unknown, index: number): SeriesPoint => {
        const date: Date = new Date(Date.UTC(year, month - 1 + index, 1));
        return { date: date.toISOString().slice(0, 10), value };
    });
}

export function flatSeries(ipcaValue: string = '0.5'): CurveSeries {
    return seriesOf([{ date: '2026-01-02', value: '0.05' }], monthlyIpca('2024-01', 24, ipcaValue));
}

export function makeScheduleTitle(overrides: Partial<ScheduleTitle> = {}): ScheduleTitle {
    return {
        id: 'title-1',
        name: 'CDB Banco Exemplo',
        kind: 'cdb',
        indexer: 'prefixed',
        rateBps: 1000,
        currency: 'BRL',
        appliedMinor: 9_000_000,
        appliedAt: '2025-03-16',
        maturityDate: MATURITY_252_BUSINESS_DAYS,
        taxRegime: 'regressive',
        issuerName: null,
        valueMinor: 10_000_000,
        valuationEstimated: false,
        indexDataMissing: false,
        matured: false,
        isSample: false,
        ...overrides
    };
}

export function makeScheduleTreasury(overrides: Partial<ScheduleTreasury> = {}): ScheduleTreasury {
    return {
        id: 'position-1',
        name: 'Tesouro Selic 2029',
        kind: 'selic',
        quantity: '2.5',
        maturityDate: MATURITY_252_BUSINESS_DAYS,
        valueTodayMinor: 1_000_000,
        isSample: false,
        ...overrides
    };
}

export function makeInputs(overrides: Partial<ScheduleInputs> = {}): ScheduleInputs {
    return { today: TODAY, series: flatSeries(), usdRate: null, titles: [], treasuries: [], ...overrides };
}
