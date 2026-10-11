import { Cell, Column, Row, stream, Worksheet } from 'exceljs';
import { Writable } from 'node:stream';
import { currencyExponent } from '../utils/decimal.util';

const DEFAULT_DATE_FORMAT: string = 'yyyy-mm-dd';
const CURRENCY_SYMBOLS: Readonly<Record<string, string>> = { BRL: 'R$', USD: 'US$' };

export type XlsxColumnType = 'text' | 'number' | 'date';

export interface XlsxColumn {
    readonly header: string;
    readonly type: XlsxColumnType;
    readonly width: number;
    readonly numFmt?: string;
}

export interface XlsxFormattedValue {
    readonly value: string | number | Date | null;
    readonly numFmt: string;
}

export type XlsxCell = string | number | Date | null | XlsxFormattedValue;

export interface XlsxSheetSpec {
    readonly name: string;
    readonly columns: readonly XlsxColumn[];
}

export function currencyFormatOf(currency: string): string {
    const exponent: number = currencyExponent(currency);
    const symbol: string = CURRENCY_SYMBOLS[currency] ?? currency;
    return `"${symbol}" #,##0${exponent > 0 ? `.${'0'.repeat(exponent)}` : ''}`;
}

function isFormatted(cell: XlsxCell): cell is XlsxFormattedValue {
    return typeof cell === 'object' && cell !== null && !(cell instanceof Date);
}

function formatOf(column: XlsxColumn | undefined): string | undefined {
    if (column === undefined) {
        return undefined;
    }
    return column.numFmt ?? (column.type === 'date' ? DEFAULT_DATE_FORMAT : undefined);
}

export class XlsxSheetBuilder {
    private readonly chunks: Buffer[] = [];
    private readonly workbook: stream.xlsx.WorkbookWriter;
    private readonly sheet: Worksheet;

    public constructor(private readonly spec: XlsxSheetSpec) {
        const sink: Writable = new Writable({
            write: (chunk: Buffer, _encoding: BufferEncoding, done: () => void): void => {
                this.chunks.push(chunk);
                done();
            }
        });
        this.workbook = new stream.xlsx.WorkbookWriter({ stream: sink, useStyles: true });
        this.sheet = this.workbook.addWorksheet(spec.name, { views: [{ state: 'frozen', ySplit: 1 }] });
        this.sheet.columns = spec.columns.map((column: XlsxColumn): Partial<Column> => ({ header: column.header, width: column.width }));
        const header: Row = this.sheet.getRow(1);
        header.font = { bold: true };
        header.commit();
    }

    public append(cells: readonly XlsxCell[]): void {
        const row: Row = this.sheet.addRow(
            cells.map((cell: XlsxCell): string | number | Date | null => (isFormatted(cell) ? cell.value : cell))
        );
        cells.forEach((cell: XlsxCell, index: number): void => {
            const target: Cell = row.getCell(index + 1);
            const column: XlsxColumn | undefined = this.spec.columns[index];
            const numFmt: string | undefined = isFormatted(cell) ? cell.numFmt : formatOf(column);
            if (numFmt !== undefined) {
                target.numFmt = numFmt;
            }
        });
        row.commit();
    }

    public async finish(): Promise<Buffer> {
        this.sheet.commit();
        await this.workbook.commit();
        return Buffer.concat(this.chunks);
    }
}

export async function buildXlsx(spec: XlsxSheetSpec, rows: Iterable<readonly XlsxCell[]>): Promise<Buffer> {
    const builder: XlsxSheetBuilder = new XlsxSheetBuilder(spec);
    for (const row of rows) {
        builder.append(row);
    }
    return builder.finish();
}
