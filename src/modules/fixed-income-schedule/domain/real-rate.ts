import { compareCodeUnits } from '../../../shared/utils/compare-code-units';
import { Decimal, DecimalUtil } from '../../../shared/utils/decimal.util';
import { accumulatedInflation, Inflation, IpcaSeries, ReferenceRates } from '../../fixed-income/services/index-series-math';
import { nominalAnnualRate } from './reference-rates';
import { LOW_REAL_RATE_BPS, RealRateItem, ScheduleInputs, ScheduleTitle } from './schedule.types';

const BPS_PER_UNIT: number = 10000;
const BRL: string = 'BRL';

interface RealContext {
    readonly ipca: IpcaSeries;
    readonly ipca12m: Decimal;
    readonly lastMonth: string;
    readonly rates: ReferenceRates;
}

interface PurchasingPower {
    readonly correctedMinor: number;
    readonly gainMinor: number;
    readonly gainBps: number;
    readonly estimated: boolean;
}

interface RateFigures {
    readonly nominalBps: number | null;
    readonly realBps: number | null;
}

function bpsOf(fraction: Decimal): number {
    return DecimalUtil.roundHalfUpToInteger(fraction.times(BPS_PER_UNIT));
}

function realAnnual(nominal: Decimal | null, ipca12m: Decimal): Decimal | null {
    return nominal === null ? null : DecimalUtil.of(1).plus(nominal).div(DecimalUtil.of(1).plus(ipca12m)).minus(1);
}

function purchasingPowerOf(title: ScheduleTitle, context: RealContext): PurchasingPower {
    const inflation: Inflation = accumulatedInflation(context.ipca, title.appliedAt, context.lastMonth);
    const correctedMinor: number = DecimalUtil.roundHalfUpToInteger(DecimalUtil.of(title.appliedMinor).times(inflation.factor));
    const gainMinor: number = title.valueMinor - correctedMinor;
    const gainBps: number = correctedMinor === 0 ? 0 : bpsOf(DecimalUtil.of(gainMinor).div(correctedMinor));
    return { correctedMinor, gainMinor, gainBps, estimated: inflation.estimated };
}

function rateFiguresOf(title: ScheduleTitle, context: RealContext): RateFigures {
    const nominal: Decimal | null = nominalAnnualRate(title.indexer, title.rateBps, context.rates);
    const real: Decimal | null = realAnnual(nominal, context.ipca12m);
    return { nominalBps: nominal === null ? null : bpsOf(nominal), realBps: real === null ? null : bpsOf(real) };
}

function itemOf(title: ScheduleTitle, context: RealContext): RealRateItem {
    const rate: RateFigures = rateFiguresOf(title, context);
    const power: PurchasingPower = purchasingPowerOf(title, context);
    return {
        id: title.id,
        name: title.name,
        kind: title.kind,
        indexer: title.indexer,
        rateBps: title.rateBps,
        appliedMinor: title.appliedMinor,
        appliedAt: title.appliedAt,
        valueMinor: title.valueMinor,
        nominalAnnualBps: rate.nominalBps,
        realAnnualBps: rate.realBps,
        lowReal: rate.realBps !== null && rate.realBps < LOW_REAL_RATE_BPS,
        correctedMinor: power.correctedMinor,
        purchasingPowerGainMinor: power.gainMinor,
        purchasingPowerGainBps: power.gainBps,
        taxRegime: title.taxRegime,
        estimated: title.valuationEstimated || title.indexDataMissing || rate.nominalBps === null || power.estimated
    };
}

function byMaturity(left: ScheduleTitle, right: ScheduleTitle): number {
    return (
        compareCodeUnits(left.maturityDate, right.maturityDate) ||
        compareCodeUnits(left.name, right.name) ||
        compareCodeUnits(left.id, right.id)
    );
}

export function buildRealRates(inputs: ScheduleInputs, rates: ReferenceRates): RealRateItem[] {
    if (rates.ipcaMonth === null || rates.ipca12m === null) {
        return [];
    }
    const context: RealContext = { ipca: inputs.series.ipca, ipca12m: rates.ipca12m, lastMonth: rates.ipcaMonth, rates };
    return inputs.titles
        .filter((title: ScheduleTitle): boolean => title.currency === BRL && !title.matured)
        .sort(byMaturity)
        .map((title: ScheduleTitle): RealRateItem => itemOf(title, context));
}
