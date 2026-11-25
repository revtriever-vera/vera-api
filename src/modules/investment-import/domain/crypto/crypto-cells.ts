import { DateUtil } from '../../../../shared/utils/date.util';
import { decimalStringOf } from '../../../../shared/utils/decimal.util';
import { dateOf, textOf, RawCell } from '../b3/b3-cells';
import { CryptoAmount } from './crypto-events.types';

const UNIT_SUFFIX: RegExp = /^(-?[\d.,]+)\s*([A-Za-z][A-Za-z0-9]*)$/;
const CURRENCY_NOISE: RegExp = /[^\d.,-]/g;
const PLAIN_DECIMAL: RegExp = /^-?\d+(\.\d+)?$/;
const TIMESTAMP: RegExp = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z| ?UTC)?$/;

export function englishDecimalOf(cell: RawCell | undefined): string | null {
    const cleaned: string = textOf(cell).replace(CURRENCY_NOISE, '').replaceAll(',', '');
    if (!PLAIN_DECIMAL.test(cleaned)) {
        return null;
    }
    return decimalStringOf(cleaned);
}

export function amountWithUnitOf(cell: RawCell | undefined): CryptoAmount | null {
    const match: RegExpExecArray | null = UNIT_SUFFIX.exec(textOf(cell));
    const quantity: string | null = englishDecimalOf(match?.[1] ?? null);
    const asset: string | undefined = match?.[2];
    return quantity === null || asset === undefined ? null : { asset: asset.toUpperCase(), quantity };
}

export function absolute(value: string): string {
    return value.startsWith('-') ? value.slice(1) : value;
}

export function utcTradeDateOf(cell: RawCell | undefined): string | null {
    const match: RegExpExecArray | null = TIMESTAMP.exec(textOf(cell));
    if (match === null) {
        return dateOf(cell);
    }
    const [, year, month, day, hour, minute, second] = match;
    const instant: Date = new Date(
        Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second ?? '0'))
    );
    return Number.isNaN(instant.getTime()) ? null : DateUtil.localDateIn(DateUtil.BRAZIL_TIMEZONE, instant);
}

export function isPositive(value: string | null): value is string {
    return value !== null && Number(value) > 0;
}
