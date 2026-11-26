import { Decimal, DecimalUtil } from '../../../../shared/utils/decimal.util';
import {
    Accrual,
    accumulatedInflation,
    businessDaysBetween,
    cdiAccrual,
    compoundFactor,
    CurveSeries,
    Indexer
} from '../../../fixed-income/services/index-series-math';

export const INFERENCE_REASONS: {
    readonly missingData: 'missing_data';
    readonly implausible: 'implausible';
    readonly missingSeries: 'missing_series';
    readonly tooRecent: 'too_recent';
} = {
    missingData: 'missing_data',
    implausible: 'implausible',
    missingSeries: 'missing_series',
    tooRecent: 'too_recent'
} as const;
export type InferenceReason = (typeof INFERENCE_REASONS)[keyof typeof INFERENCE_REASONS];

export const B3_INDEXERS: Readonly<Record<string, Indexer>> = { DI: 'cdi_percent', IPCA: 'ipca_plus', PRE: 'prefixed' };

interface Band {
    readonly minBps: number;
    readonly maxBps: number;
    readonly stepBps: number;
}

export const PLAUSIBLE_BANDS: Readonly<Record<Indexer, Band>> = {
    cdi_percent: { minBps: 5000, maxBps: 20000, stepBps: 10 },
    ipca_plus: { minBps: 0, maxBps: 1500, stepBps: 1 },
    prefixed: { minBps: 0, maxBps: 3000, stepBps: 1 }
};

export const MIN_BUSINESS_DAYS: number = 21;
const BPS_PER_UNIT: number = 10000;
const MONTHS_PER_YEAR: number = 12;

export interface RateInferenceInput {
    readonly indexer: string | null;
    readonly issueDate: string | null;
    readonly positionDate: string;
    readonly issueUnitPrice: string | null;
    readonly curveUnitPrice: string | null;
    readonly series: CurveSeries;
}

export type RateInference =
    | { readonly found: true; readonly indexer: Indexer; readonly rateBps: number; readonly estimated: boolean }
    | { readonly found: false; readonly reason: InferenceReason };

interface Growth {
    readonly indexer: Indexer;
    readonly issueDate: string;
    readonly positionDate: string;
    readonly series: CurveSeries;
}

function failure(reason: InferenceReason): RateInference {
    return { found: false, reason };
}

function monthNumber(monthKey: string): number {
    const [year, month]: number[] = monthKey.split('-').map(Number) as [number, number];
    return year * MONTHS_PER_YEAR + month;
}

function lastIpcaMonth(growth: Growth): string | null {
    const published: string | undefined = growth.series.ipca.months.at(-1);
    const first: string | undefined = growth.series.ipca.months[0];
    const wanted: string = growth.positionDate.slice(0, 7);
    if (published === undefined || first === undefined || first > growth.issueDate.slice(0, 7)) {
        return null;
    }
    if (monthNumber(wanted) - monthNumber(published) > 1) {
        return null;
    }
    return published < wanted ? published : wanted;
}

function ipcaGrowth(growth: Growth, rateBps: number): Accrual | null {
    const lastMonth: string | null = lastIpcaMonth(growth);
    if (lastMonth === null) {
        return null;
    }
    const inflation: Accrual = accumulatedInflation(growth.series.ipca, growth.issueDate, lastMonth);
    const real: Decimal = compoundFactor(DecimalUtil.of(rateBps).div(BPS_PER_UNIT), growth.issueDate, growth.positionDate);
    return { factor: inflation.factor.times(real), estimated: inflation.estimated };
}

function growthAt(growth: Growth, rateBps: number): Accrual | null {
    if (growth.indexer === 'cdi_percent') {
        return cdiAccrual(growth.series.cdi, growth.issueDate, growth.positionDate, rateBps);
    }
    if (growth.indexer === 'ipca_plus') {
        return ipcaGrowth(growth, rateBps);
    }
    const factor: Decimal = compoundFactor(DecimalUtil.of(rateBps).div(BPS_PER_UNIT), growth.issueDate, growth.positionDate);
    return { factor, estimated: false };
}

function distance(accrual: Accrual, target: Decimal): Decimal {
    return accrual.factor.minus(target).abs();
}

function nearest(growth: Growth, target: Decimal, band: Band, below: number, above: number): RateInference {
    const lower: Accrual = growthAt(growth, below * band.stepBps) as Accrual;
    const upper: Accrual = growthAt(growth, above * band.stepBps) as Accrual;
    const closest: boolean = distance(lower, target).lte(distance(upper, target));
    return {
        found: true,
        indexer: growth.indexer,
        rateBps: (closest ? below : above) * band.stepBps,
        estimated: (closest ? lower : upper).estimated
    };
}

function bisect(growth: Growth, target: Decimal, band: Band): RateInference {
    const low: Accrual | null = growthAt(growth, band.minBps);
    const high: Accrual | null = growthAt(growth, band.maxBps);
    if (low === null || high === null) {
        return failure(INFERENCE_REASONS.missingSeries);
    }
    if (target.lt(low.factor) || target.gt(high.factor)) {
        return failure(INFERENCE_REASONS.implausible);
    }
    let below: number = band.minBps / band.stepBps;
    let above: number = band.maxBps / band.stepBps;
    while (above - below > 1) {
        const middle: number = (below + above) >> 1;
        const reachedTarget: boolean = (growthAt(growth, middle * band.stepBps) as Accrual).factor.gte(target);
        below = reachedTarget ? below : middle;
        above = reachedTarget ? middle : above;
    }
    return nearest(growth, target, band, below, above);
}

function positiveDecimal(text: string | null): Decimal | null {
    if (text === null) {
        return null;
    }
    const value: Decimal = DecimalUtil.of(text);
    return value.isFinite() && value.gt(0) ? value : null;
}

export function inferRate(input: RateInferenceInput): RateInference {
    const indexer: Indexer | undefined = input.indexer === null ? undefined : B3_INDEXERS[input.indexer];
    const issue: Decimal | null = positiveDecimal(input.issueUnitPrice);
    const curve: Decimal | null = positiveDecimal(input.curveUnitPrice);
    if (indexer === undefined || issue === null || curve === null || input.issueDate === null || input.issueDate >= input.positionDate) {
        return failure(INFERENCE_REASONS.missingData);
    }
    if (businessDaysBetween(input.issueDate, input.positionDate) < MIN_BUSINESS_DAYS) {
        return failure(INFERENCE_REASONS.tooRecent);
    }
    const growth: Growth = { indexer, issueDate: input.issueDate, positionDate: input.positionDate, series: input.series };
    return bisect(growth, curve.div(issue), PLAUSIBLE_BANDS[indexer]);
}
