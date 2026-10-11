import { currencyExponent, DecimalUtil } from '../utils/decimal.util';
import { AppLocale } from '../i18n/locale';

const BOM: string = '﻿';
const LINE_BREAK: string = '\r\n';
const QUOTE: string = '"';
const RADIX: number = 10;

export const CSV_DELIMITERS: Readonly<Record<AppLocale, string>> = { 'pt-BR': ';', en: ',' };
export const CSV_DECIMAL_MARKS: Readonly<Record<AppLocale, string>> = { 'pt-BR': ',', en: '.' };

export function decimalValueOf(valueMinor: number, currency: string): string {
    const exponent: number = currencyExponent(currency);
    return DecimalUtil.of(valueMinor).div(DecimalUtil.of(RADIX).pow(exponent)).toFixed(exponent);
}

export function localizedNumber(plain: string, locale: AppLocale): string {
    return plain.replace('.', CSV_DECIMAL_MARKS[locale]);
}

function quoted(field: string, delimiter: string): string {
    const needsQuotes: boolean = [delimiter, QUOTE, '\r', '\n'].some((mark: string): boolean => field.includes(mark));
    return needsQuotes ? `${QUOTE}${field.replaceAll(QUOTE, QUOTE + QUOTE)}${QUOTE}` : field;
}

export function csvLine(cells: readonly string[], locale: AppLocale): string {
    const delimiter: string = CSV_DELIMITERS[locale];
    return cells.map((cell: string): string => quoted(cell, delimiter)).join(delimiter) + LINE_BREAK;
}

export function writeCsv(header: readonly string[], rows: readonly (readonly string[])[], locale: AppLocale): string {
    return BOM + csvLine(header, locale) + rows.map((cells: readonly string[]): string => csvLine(cells, locale)).join('');
}
