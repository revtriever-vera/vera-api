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
    const fraction: string = exponent > 0 ? `.${'0'.repeat(exponent)}` : '';
    return `"${symbol}" #,##0${fraction}`;
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

export class XlsxSheetWriter {
    private readonly sheet: Worksheet;

    public constructor(
        private readonly spec: XlsxSheetSpec,
        workbook: stream.xlsx.WorkbookWriter
    ) {
        this.sheet = workbook.addWorksheet(spec.name, { views: [{ state: 'frozen', ySplit: 1 }] });
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

    public commit(): void {
        this.sheet.commit();
    }
}

export class XlsxWorkbookBuilder {
    private readonly chunks: Buffer[] = [];
    private readonly workbook: stream.xlsx.WorkbookWriter;

    public constructor() {
        const sink: Writable = new Writable({
            write: (chunk: Buffer, _encoding: BufferEncoding, done: () => void): void => {
                this.chunks.push(chunk);
                done();
            }
        });
        this.workbook = new stream.xlsx.WorkbookWriter({ stream: sink, useStyles: true });
    }

    public sheet(spec: XlsxSheetSpec): XlsxSheetWriter {
        return new XlsxSheetWriter(spec, this.workbook);
    }

    public async finish(): Promise<Buffer> {
        await this.workbook.commit();
        return Buffer.concat(this.chunks);
    }
}

export class XlsxSheetBuilder {
    private readonly book: XlsxWorkbookBuilder = new XlsxWorkbookBuilder();
    private readonly writer: XlsxSheetWriter;

    public constructor(spec: XlsxSheetSpec) {
        this.writer = this.book.sheet(spec);
    }

    public append(cells: readonly XlsxCell[]): void {
        this.writer.append(cells);
    }

    public async finish(): Promise<Buffer> {
        this.writer.commit();
        return this.book.finish();
    }
}

export async function buildXlsx(spec: XlsxSheetSpec, rows: Iterable<readonly XlsxCell[]>): Promise<Buffer> {
    const builder: XlsxSheetBuilder = new XlsxSheetBuilder(spec);
    for (const row of rows) {
        builder.append(row);
    }
    return builder.finish();
}
