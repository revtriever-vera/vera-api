import { mulDecimal, toMinor } from '../../../shared/utils/decimal.util';
import { Conversion, convertMinor } from './currency-conversion';
import { SourceRate } from './portfolio.types';

export interface ValuedAmount {
    readonly nativeValueMinor: number;
    readonly valueMinor: number;
    readonly missingRate: boolean;
}

export interface PositionAmountInput {
    readonly quantity: string;
    readonly price: string;
    readonly nativeCurrency: string;
    readonly baseCurrency: string;
    readonly usdRate: SourceRate | null;
}

export function nativeValueOf(quantity: string, price: string, currency: string): number {
    return toMinor(mulDecimal(quantity, price), currency);
}

export function valueNative(
    nativeValueMinor: number,
    nativeCurrency: string,
    baseCurrency: string,
    usdRate: SourceRate | null
): ValuedAmount {
    const converted: Conversion = convertMinor(nativeValueMinor, nativeCurrency, baseCurrency, usdRate);
    return { nativeValueMinor, valueMinor: converted.valueMinor, missingRate: converted.missingRate };
}

export function valuePosition(input: PositionAmountInput): ValuedAmount {
    const nativeValueMinor: number = nativeValueOf(input.quantity, input.price, input.nativeCurrency);
    return valueNative(nativeValueMinor, input.nativeCurrency, input.baseCurrency, input.usdRate);
}
