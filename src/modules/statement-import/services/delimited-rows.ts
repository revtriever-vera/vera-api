import { CsvRecord, detectDelimiter, readCsv, CsvScan } from '../domain/csv-reader';
import { decodeStatement } from '../domain/text-decoding';
import { firstLineOf } from '../domain/format-detector';

export interface DelimitedRow {
    readonly line: number;
    readonly cells: readonly string[];
}

export interface DelimitedRows {
    readonly rows: readonly DelimitedRow[];
    readonly overflow: boolean;
}

export function readDelimitedRows(bytes: Uint8Array, maxRows: number): DelimitedRows {
    const text: string = decodeStatement(bytes);
    const scan: CsvScan = readCsv(text, detectDelimiter(firstLineOf(text)), maxRows);
    return {
        rows: scan.records.map((record: CsvRecord): DelimitedRow => ({ line: record.line, cells: record.cells })),
        overflow: scan.overflow
    };
}
