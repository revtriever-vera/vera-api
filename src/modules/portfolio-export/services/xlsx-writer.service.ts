import { Injectable } from '@nestjs/common';
import { buildXlsx, currencyFormatOf, XlsxCell, XlsxColumn } from '../../../shared/spreadsheet/xlsx';
import { DecimalUtil } from '../../../shared/utils/decimal.util';
import { decimalValueOf } from '../../../shared/spreadsheet/csv';
import { headerLabelsOf, sheetNameOf } from '../domain/export-labels';
import { ExportRow, ExportTable } from '../domain/export.types';

const QUANTITY_COLUMN: number = 6;
const VALUE_COLUMN: number = 7;
const COLUMN_WIDTHS: readonly number[] = [18, 40, 24, 14, 28, 24, 16, 22, 28, 24];

export { currencyFormatOf };

export function quantityFormatOf(decimals: number | null): string {
    return decimals === null || decimals === 0 ? '0' : `0.${'0'.repeat(decimals)}`;
}

function cellsOf(row: ExportRow, currency: string): XlsxCell[] {
    return [
        row.symbol,
        row.name,
        row.className,
        row.titleKindLabel,
        row.issuerName,
        row.groupName,
        { value: row.quantity === null ? null : DecimalUtil.of(row.quantity).toNumber(), numFmt: quantityFormatOf(row.quantityDecimals) },
        { value: DecimalUtil.of(decimalValueOf(row.valueMinor, currency)).toNumber(), numFmt: currencyFormatOf(currency) },
        row.valueSourceLabel,
        row.holderLabel
    ];
}

@Injectable()
export class XlsxWriterService {
    public async write(table: ExportTable): Promise<Buffer> {
        const columns: XlsxColumn[] = headerLabelsOf(table.locale, table.baseCurrency).map((header: string, index: number): XlsxColumn => ({
            header,
            type: index === QUANTITY_COLUMN || index === VALUE_COLUMN ? 'number' : 'text',
            width: COLUMN_WIDTHS[index] as number
        }));
        return buildXlsx(
            { name: sheetNameOf(table.locale), columns },
            table.rows.map((row: ExportRow): XlsxCell[] => cellsOf(row, table.baseCurrency))
        );
    }
}
