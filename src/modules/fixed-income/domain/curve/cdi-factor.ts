import { Decimal, DecimalUtil } from '../../../../shared/utils/decimal.util';
import { AccrualDay } from './curve.types';

const PERCENT: number = 100;
const BPS_PER_UNIT: number = 10000;

export function cdiPercentFactor(days: readonly AccrualDay[], percentBps: number): Decimal {
    const percentOfCdi: Decimal = DecimalUtil.of(percentBps).div(BPS_PER_UNIT);
    return days.reduce(
        (factor: Decimal, day: AccrualDay): Decimal => factor.times(DecimalUtil.of(1).plus(day.rate.div(PERCENT).times(percentOfCdi))),
        DecimalUtil.of(1)
    );
}
