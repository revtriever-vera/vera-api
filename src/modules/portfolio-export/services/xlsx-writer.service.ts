import { Injectable } from '@nestjs/common';
import { Cell, Column, Row, Workbook, Worksheet } from 'exceljs';
import { currencyExponent, DecimalUtil } from '../../../shared/utils/decimal.util';
import { decimalValueOf } from '../domain/csv-writer';
import { headerLabelsOf, sheetNameOf } from '../domain/export-labels';
import { ExportRow, ExportTable } from '../domain/export.types';

const COLUMN_WIDTHS: readonly number[] = [18, 40, 24, 16, 22, 28];
const QUANTITY_COLUMN: number = 4;
const VALUE_COLUMN: number = 5;
const CURRENCY_SYMBOLS: Readonly<Record<string, string>> = { BRL: 'R$', USD: 'US$' };

export function currencyFormatOf(currency: string): string {
    const exponent: number = currencyExponent(currency);
    const symbol: string = CURRENCY_SYMBOLS[currency] ?? currency;
    return `"${symbol}" #,##0${exponent > 0 ? `.${'0'.repeat(exponent)}` : ''}`;
}

export function quantityFormatOf(decimals: number | null): string {
    return decimals === null || decimals === 0 ? '0' : `0.${'0'.repeat(decimals)}`;
}

@Injectable()
export class XlsxWriterService {
    public async write(table: ExportTable): Promise<Buffer> {
        const workbook: Workbook = new Workbook();
        const sheet: Worksheet = workbook.addWorksheet(sheetNameOf(table.locale), { views: [{ state: 'frozen', ySplit: 1 }] });
        sheet.columns = headerLabelsOf(table.locale, table.baseCurrency).map((header: string, index: number): Partial<Column> => ({
            header,
            width: COLUMN_WIDTHS[index]
        }));
        sheet.getRow(1).font = { bold: true };
        table.rows.forEach((row: ExportRow): void => {
            this.append(sheet, row, table.baseCurrency);
        });
        return Buffer.from(await workbook.xlsx.writeBuffer());
    }

    private append(sheet: Worksheet, row: ExportRow, currency: string): void {
        const added: Row = sheet.addRow([
            row.symbol,
            row.name,
            row.className,
            row.quantity === null ? null : DecimalUtil.of(row.quantity).toNumber(),
            DecimalUtil.of(decimalValueOf(row.valueMinor, currency)).toNumber(),
            row.valueSourceLabel
        ]);
        const quantity: Cell = added.getCell(QUANTITY_COLUMN);
        quantity.numFmt = quantityFormatOf(row.quantityDecimals);
        const value: Cell = added.getCell(VALUE_COLUMN);
        value.numFmt = currencyFormatOf(currency);
    }
}
