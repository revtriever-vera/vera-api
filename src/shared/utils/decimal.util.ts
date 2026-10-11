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
