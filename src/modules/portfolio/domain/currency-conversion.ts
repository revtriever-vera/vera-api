import { Decimal, DecimalUtil } from '../../../shared/utils/decimal.util';
import { SourceRate, USD_CURRENCY } from './portfolio.types';

export interface Conversion {
    readonly valueMinor: number;
    readonly missingRate: boolean;
}

function usableRate(rate: SourceRate | null): string | null {
    return rate !== null && DecimalUtil.of(rate.brlPerUnit).gt(0) ? rate.brlPerUnit : null;
}

export function convertMinor(nativeMinor: number, from: string, to: string, usdRate: SourceRate | null): Conversion {
    if (from === to || nativeMinor === 0) {
        return { valueMinor: nativeMinor, missingRate: false };
    }
    const rate: string | null = usableRate(usdRate);
    if (rate === null) {
        return { valueMinor: 0, missingRate: true };
    }
    const converted: Decimal = from === USD_CURRENCY ? DecimalUtil.of(nativeMinor).mul(rate) : DecimalUtil.of(nativeMinor).div(rate);
    return { valueMinor: DecimalUtil.roundHalfUpToInteger(converted), missingRate: false };
}
