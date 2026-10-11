import { DecimalUtil } from '../../../shared/utils/decimal.util';
import { BPS_TOTAL, DollarExposure, Holding, USD_CURRENCY } from './portfolio.types';

export function isDollarExposed(holding: Pick<Holding, 'nativeCurrency' | 'dollarExposure'>): boolean {
    return holding.nativeCurrency === USD_CURRENCY || holding.dollarExposure;
}

export function dollarExposureOf(
    holdings: readonly Pick<Holding, 'nativeCurrency' | 'dollarExposure' | 'valueMinor'>[],
    totalMinor: number
): DollarExposure {
    const valueMinor: number = holdings
        .filter(isDollarExposed)
        .reduce((sum: number, holding: Pick<Holding, 'valueMinor'>) => sum + holding.valueMinor, 0);
    if (totalMinor === 0) {
        return { valueMinor, shareBps: 0 };
    }
    return { valueMinor, shareBps: DecimalUtil.roundHalfUpToInteger(DecimalUtil.of(valueMinor).mul(BPS_TOTAL).div(totalMinor)) };
}
