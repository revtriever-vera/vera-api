import ExcelJS from 'exceljs';
import { DelimitedRow, DelimitedRows, readDelimitedRows } from '../../../statement-import/services/delimited-rows';
import { FormatNotRecognizedError, ReportTooLargeError } from '../investment-import.errors';
import { FORMAT_SUGGESTIONS, ParsedInvestmentStatement } from '../investment-statement.types';
import { RawCell, RawRow, RawTable } from './b3-cells';
import { parseB3Tables } from './b3-statement';

export const MAX_B3_ROWS: number = 20_000;

const ZIP_MAGIC: readonly number[] = [0x50, 0x4b];
const PDF_MAGIC: readonly number[] = [0x25, 0x50, 0x44, 0x46];
const IMAGE_MAGICS: readonly (readonly number[])[] = [
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    [0xff, 0xd8, 0xff],
    [0x47, 0x49, 0x46, 0x38]
];
const RIFF_MAGIC: readonly number[] = [0x52, 0x49, 0x46, 0x46];
const WEBP_TAG: readonly number[] = [0x57, 0x45, 0x42, 0x50];

function isImage(bytes: Uint8Array): boolean {
    const webp: boolean =
        startsWith(bytes, RIFF_MAGIC) && WEBP_TAG.every((value: number, index: number): boolean => bytes[8 + index] === value);
    return webp || IMAGE_MAGICS.some((magic: readonly number[]): boolean => startsWith(bytes, magic));
}

function startsWith(bytes: Uint8Array, magic: readonly number[]): boolean {
    return magic.every((value: number, index: number): boolean => bytes[index] === value);
}

function textOfRich(value: ExcelJS.CellRichTextValue): string {
    return value.richText.map((part: ExcelJS.RichText): string => part.text).join('');
}

function cellOf(value: ExcelJS.CellValue): RawCell {
    if (value === null || value === undefined || typeof value === 'boolean') {
        return null;
    }
    if (typeof value === 'string' || typeof value === 'number') {
        return value;
    }
    if (value instanceof Date) {
        return value.toISOString().slice(0, 10);
    }
    if ('richText' in value) {
        return textOfRich(value);
    }
    if ('result' in value) {
        return cellOf(value.result);
    }
    return 'text' in value ? value.text : null;
}

function rowsOf(sheet: ExcelJS.Worksheet): RawRow[] {
    const rows: RawRow[] = [];
    sheet.eachRow({ includeEmpty: false }, (row: ExcelJS.Row, line: number): void => {
        const values: ExcelJS.CellValue[] = Array.isArray(row.values) ? Array.from(row.values.slice(1)) : [];
        rows.push({ line, cells: values.map(cellOf) });
    });
    return rows;
}

async function readWorkbook(bytes: Uint8Array): Promise<RawTable[]> {
    const workbook: ExcelJS.Workbook = new ExcelJS.Workbook();
    try {
        await workbook.xlsx.load(Buffer.from(bytes) as unknown as ExcelJS.Buffer);
    } catch {
        throw new FormatNotRecognizedError(null);
    }
    return workbook.worksheets.map((sheet: ExcelJS.Worksheet): RawTable => ({ name: sheet.name, rows: rowsOf(sheet) }));
}

function readText(bytes: Uint8Array): RawTable[] {
    const scan: DelimitedRows = readDelimitedRows(bytes, MAX_B3_ROWS);
    if (scan.overflow) {
        throw new ReportTooLargeError(MAX_B3_ROWS);
    }
    return [{ name: '', rows: scan.rows.map((row: DelimitedRow): RawRow => ({ line: row.line, cells: row.cells })) }];
}

function assertWithinLimit(tables: readonly RawTable[]): void {
    const total: number = tables.reduce((sum: number, table: RawTable): number => sum + table.rows.length, 0);
    if (total > MAX_B3_ROWS) {
        throw new ReportTooLargeError(MAX_B3_ROWS);
    }
}

export async function readB3Report(bytes: Uint8Array): Promise<ParsedInvestmentStatement> {
    if (startsWith(bytes, PDF_MAGIC) || isImage(bytes)) {
        throw new FormatNotRecognizedError(FORMAT_SUGGESTIONS.b3Excel);
    }
    const tables: RawTable[] = startsWith(bytes, ZIP_MAGIC) ? await readWorkbook(bytes) : readText(bytes);
    assertWithinLimit(tables);
    return parseB3Tables(tables);
}
