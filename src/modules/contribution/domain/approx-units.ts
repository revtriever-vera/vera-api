import Decimal from 'decimal.js';
import { DecimalUtil, currencyExponent } from '../../../shared/utils/decimal.util';

const BRL: string = 'BRL';
const USD: string = 'USD';
const TEN: number = 10;

function convertedMajor(major: Decimal, from: string, to: string, brlPerUsd: string | null): Decimal | null {
    if (from === to) {
        return major;
    }
    if (brlPerUsd === null || DecimalUtil.of(brlPerUsd).lte(0)) {
        return null;
    }
    if (from === BRL && to === USD) {
        return major.div(brlPerUsd);
    }
    return from === USD && to === BRL ? major.mul(brlPerUsd) : null;
}

export function approxUnits(
    amountBaseMinor: number,
    unitPrice: string,
    priceCurrency: string,
    baseCurrency: string,
    brlPerUsd: string | null,
    decimals: number
): string | null {
    const price: Decimal = DecimalUtil.of(unitPrice);
    if (price.lte(0)) {
        return null;
    }
    const major: Decimal = DecimalUtil.of(amountBaseMinor).div(DecimalUtil.of(TEN).pow(currencyExponent(baseCurrency)));
    const inPriceCurrency: Decimal | null = convertedMajor(major, baseCurrency, priceCurrency, brlPerUsd);
    return inPriceCurrency === null ? null : inPriceCurrency.div(price).toDecimalPlaces(decimals, Decimal.ROUND_DOWN).toFixed();
}
