import { AppLocale } from '../../../shared/i18n/locale';
import { decimalValueOf, localizedNumber } from '../../../shared/spreadsheet/csv';
import { spreadsheetSafeText } from '../../../shared/spreadsheet/spreadsheet-safe-text';
import { currencyFormatOf, XlsxCell, XlsxColumn } from '../../../shared/spreadsheet/xlsx';
import { DecimalUtil } from '../../../shared/utils/decimal.util';
import { ExportHeaders, EXPORT_LABELS, originLabelOf, sourceLabelOf } from './export-labels';
import { ExportTransaction, TransactionExportRow } from './transactions-export.types';

const XLSX_DATE_FORMATS: Readonly<Record<AppLocale, string>> = { 'pt-BR': 'dd/mm/yyyy', en: 'yyyy-mm-dd' };
const COLUMN_WIDTHS: readonly number[] = [14, 44, 28, 16, 8, 28, 22, 26, 20, 26];

export function exportRowOf(transaction: ExportTransaction, categoryLabel: string, locale: AppLocale): TransactionExportRow {
    return {
        date: transaction.date,
        description: spreadsheetSafeText(transaction.description),
        counterparty: spreadsheetSafeText(transaction.counterpartyName ?? ''),
        amountMinor: transaction.amountMinor,
        currency: transaction.currency,
        category: spreadsheetSafeText(categoryLabel),
        categoryOrigin: originLabelOf(transaction.categorySource, locale),
        account: spreadsheetSafeText(transaction.accountName),
        institution: spreadsheetSafeText(transaction.institutionName ?? ''),
        source: sourceLabelOf(transaction.source, locale)
    };
}

export function headerOf(locale: AppLocale): string[] {
    const headers: ExportHeaders = EXPORT_LABELS[locale].headers;
    return [
        headers.date,
        headers.description,
        headers.counterparty,
        headers.amount,
        headers.currency,
        headers.category,
        headers.categoryOrigin,
        headers.account,
        headers.institution,
        headers.source
    ];
}

export function columnsOf(locale: AppLocale): XlsxColumn[] {
    const types: XlsxColumn['type'][] = ['date', 'text', 'text', 'number', 'text', 'text', 'text', 'text', 'text', 'text'];
    return headerOf(locale).map((header: string, index: number): XlsxColumn => ({
        header,
        type: types[index] as XlsxColumn['type'],
        width: COLUMN_WIDTHS[index] as number,
        numFmt: index === 0 ? XLSX_DATE_FORMATS[locale] : undefined
    }));
}

function csvDateOf(date: string, locale: AppLocale): string {
    const [year, month, day] = date.split('-');
    return locale === 'pt-BR' ? [day, month, year].join('/') : date;
}

function utcDateOf(date: string): Date {
    return new Date(`${date}T00:00:00Z`);
}

export function csvCellsOf(row: TransactionExportRow, locale: AppLocale): string[] {
    return [
        csvDateOf(row.date, locale),
        row.description,
        row.counterparty,
        localizedNumber(decimalValueOf(row.amountMinor, row.currency), locale),
        row.currency,
        row.category,
        row.categoryOrigin,
        row.account,
        row.institution,
        row.source
    ];
}

export function xlsxCellsOf(row: TransactionExportRow): XlsxCell[] {
    return [
        utcDateOf(row.date),
        row.description,
        row.counterparty,
        { value: DecimalUtil.of(decimalValueOf(row.amountMinor, row.currency)).toNumber(), numFmt: currencyFormatOf(row.currency) },
        row.currency,
        row.category,
        row.categoryOrigin,
        row.account,
        row.institution,
        row.source
    ];
}
