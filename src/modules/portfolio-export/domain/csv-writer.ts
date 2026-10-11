import { AppLocale } from '../../../shared/i18n/locale';
import { decimalValueOf, localizedNumber, writeCsv as writeSharedCsv } from '../../../shared/spreadsheet/csv';
import { DecimalUtil } from '../../../shared/utils/decimal.util';
import { headerLabelsOf } from './export-labels';
import { ExportRow, ExportTable } from './export.types';

function cellsOf(row: ExportRow, table: ExportTable): string[] {
    const locale: AppLocale = table.locale;
    const quantity: string = row.quantity === null ? '' : localizedNumber(DecimalUtil.of(row.quantity).toFixed(), locale);
    const value: string = localizedNumber(decimalValueOf(row.valueMinor, table.baseCurrency), locale);
    return [row.symbol, row.name, row.className, quantity, value, row.valueSourceLabel];
}

export function writeCsv(table: ExportTable): string {
    return writeSharedCsv(
        headerLabelsOf(table.locale, table.baseCurrency),
        table.rows.map((row: ExportRow): string[] => cellsOf(row, table)),
        table.locale
    );
}
