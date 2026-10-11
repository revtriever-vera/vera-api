import { currencyExponent, DecimalUtil } from '../../../shared/utils/decimal.util';
import { AppLocale } from '../../../shared/i18n/locale';
import { headerLabelsOf } from './export-labels';
import { ExportRow, ExportTable } from './export.types';

const BOM: string = '﻿';
const LINE_BREAK: string = '\r\n';
const QUOTE: string = '"';
const RADIX: number = 10;

const DELIMITERS: Readonly<Record<AppLocale, string>> = { 'pt-BR': ';', en: ',' };
const DECIMAL_MARKS: Readonly<Record<AppLocale, string>> = { 'pt-BR': ',', en: '.' };

export function decimalValueOf(valueMinor: number, currency: string): string {
    const exponent: number = currencyExponent(currency);
    return DecimalUtil.of(valueMinor).div(DecimalUtil.of(RADIX).pow(exponent)).toFixed(exponent);
}

function quoted(field: string, delimiter: string): string {
    const needsQuotes: boolean = [delimiter, QUOTE, '\r', '\n'].some((mark: string): boolean => field.includes(mark));
    return needsQuotes ? `${QUOTE}${field.replaceAll(QUOTE, QUOTE + QUOTE)}${QUOTE}` : field;
}

function numberText(plain: string, locale: AppLocale): string {
    return plain.replace('.', DECIMAL_MARKS[locale]);
}

function cellsOf(row: ExportRow, table: ExportTable): string[] {
    const quantity: string = row.quantity === null ? '' : numberText(DecimalUtil.of(row.quantity).toFixed(), table.locale);
    const value: string = numberText(decimalValueOf(row.valueMinor, table.baseCurrency), table.locale);
    return [row.symbol, row.name, row.className, quantity, value, row.valueSourceLabel];
}

export function writeCsv(table: ExportTable): string {
    const delimiter: string = DELIMITERS[table.locale];
    const lines: string[] = [
        [...headerLabelsOf(table.locale, table.baseCurrency)],
        ...table.rows.map((row: ExportRow): string[] => cellsOf(row, table))
    ].map((cells: string[]): string => cells.map((cell: string): string => quoted(cell, delimiter)).join(delimiter));
    return BOM + lines.map((line: string): string => line + LINE_BREAK).join('');
}
