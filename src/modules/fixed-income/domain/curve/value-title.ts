import { Decimal, DecimalUtil } from '../../../../shared/utils/decimal.util';
import { accrualDays, daysBetween } from './business-days';
import { cdiPercentFactor } from './cdi-factor';
import {
    AccrualDay,
    CurveSeries,
    CurveTerms,
    FixedIncomeValuation,
    INDEXERS,
    VALUATION_SOURCES,
    VALUATION_STATUSES,
    ValuationSource
} from './curve.types';
import { estimateIncomeTax } from './income-tax';
import { IpcaAccrual, ipcaFactor } from './ipca-factor';
import { annualRateFactor } from './prefixed-factor';

const BPS_PER_UNIT: number = 10000;

interface Accrual {
    readonly factor: Decimal;
    readonly estimated: boolean;
}

const SOURCE_BY_INDEXER: Readonly<Record<CurveTerms['indexer'], ValuationSource>> = {
    [INDEXERS.cdiPercent]: VALUATION_SOURCES.cdi,
    [INDEXERS.prefixed]: VALUATION_SOURCES.pre,
    [INDEXERS.ipcaPlus]: VALUATION_SOURCES.ipca
};

function accrue(terms: CurveTerms, days: readonly AccrualDay[], series: CurveSeries, end: string): Accrual | null {
    const projected: boolean = days.some((day: AccrualDay) => day.projected);
    if (terms.indexer === INDEXERS.cdiPercent) {
        return { factor: cdiPercentFactor(days, terms.rateBps), estimated: projected };
    }
    const real: Decimal = annualRateFactor(terms.rateBps, days.length);
    if (terms.indexer === INDEXERS.prefixed) {
        return { factor: real, estimated: projected };
    }
    const inflation: IpcaAccrual | null = ipcaFactor(series.ipca, terms.appliedAt, end);
    return inflation === null ? null : { factor: inflation.factor.times(real), estimated: projected || inflation.estimated };
}

function missing(terms: CurveTerms, asOf: string, matured: boolean): FixedIncomeValuation {
    return {
        asOf,
        valueMinor: terms.appliedMinor,
        currency: terms.currency,
        accruedBps: 0,
        matured,
        estimated: false,
        status: VALUATION_STATUSES.indexDataMissing,
        source: SOURCE_BY_INDEXER[terms.indexer],
        taxRegime: terms.taxRegime,
        taxEstimatedMinor: 0,
        netEstimatedMinor: terms.appliedMinor
    };
}

function accrualFor(terms: CurveTerms, series: CurveSeries, end: string): Accrual | null {
    const days: AccrualDay[] | null = accrualDays(series.cdi, terms.appliedAt, end);
    return days === null ? null : accrue(terms, days, series, end);
}

function grossBps(factor: Decimal): number {
    return DecimalUtil.roundHalfUpToInteger(factor.minus(1).times(BPS_PER_UNIT));
}

function priced(terms: CurveTerms, accrual: Accrual, asOf: string, matured: boolean, end: string): FixedIncomeValuation {
    const valueMinor: number = DecimalUtil.roundHalfUpToInteger(DecimalUtil.of(terms.appliedMinor).times(accrual.factor));
    const daysHeld: number = Math.max(daysBetween(terms.appliedAt, end), 0);
    const taxEstimatedMinor: number = estimateIncomeTax(terms.taxRegime, terms.appliedMinor, valueMinor, daysHeld);
    return {
        asOf,
        valueMinor,
        currency: terms.currency,
        accruedBps: grossBps(accrual.factor),
        matured,
        estimated: accrual.estimated,
        status: VALUATION_STATUSES.ok,
        source: SOURCE_BY_INDEXER[terms.indexer],
        taxRegime: terms.taxRegime,
        taxEstimatedMinor,
        netEstimatedMinor: valueMinor - taxEstimatedMinor
    };
}

export function valueTitle(terms: CurveTerms, series: CurveSeries, asOf: string): FixedIncomeValuation {
    const matured: boolean = asOf >= terms.maturityDate;
    const end: string = matured ? terms.maturityDate : asOf;
    const accrual: Accrual | null = accrualFor(terms, series, end);
    return accrual === null ? missing(terms, asOf, matured) : priced(terms, accrual, asOf, matured, end);
}
