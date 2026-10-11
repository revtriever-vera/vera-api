import Decimal from 'decimal.js';

const PRECISE: typeof Decimal = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export class DecimalUtil {
    public static of(value: Decimal.Value): Decimal {
        return new PRECISE(value);
    }

    public static roundHalfUpToInteger(value: Decimal.Value): number {
        return new PRECISE(value).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
    }
}

export type { Decimal };

const DIVISION_SCALE: number = 20;
const DEFAULT_EXPONENT: number = 2;

export function decimalStringOf(value: number | string): string {
    return DecimalUtil.of(String(value)).toFixed();
}

export function mulDecimal(left: string, right: string): string {
    return DecimalUtil.of(left).mul(right).toFixed();
}

export function divDecimal(dividend: string, divisor: string, scale: number = DIVISION_SCALE): string {
    return DecimalUtil.of(dividend).div(divisor).toDecimalPlaces(scale, Decimal.ROUND_HALF_UP).toFixed();
}

export function currencyExponent(currency: string): number {
    return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? DEFAULT_EXPONENT;
}

export function toMinor(value: string, currency: string): number {
    const scaled: Decimal = DecimalUtil.of(value).mul(DecimalUtil.of(10).pow(currencyExponent(currency)));
    const result: number = DecimalUtil.roundHalfUpToInteger(scaled);
    if (!Number.isSafeInteger(result)) {
        throw new RangeError('amount exceeds the safe integer range');
    }
    return result;
}
