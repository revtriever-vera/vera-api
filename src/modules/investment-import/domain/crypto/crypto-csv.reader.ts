import { DelimitedRow, DelimitedRows, readDelimitedRows } from '../../../statement-import/services/delimited-rows';
import { ReportTooLargeError } from '../investment-import.errors';
import { RawRow, RawTable } from '../b3/b3-cells';
import { Collected } from '../b3/b3-rows';
import { CryptoSheet, detectCryptoSheet } from './crypto-csv-detector';
import { CryptoEvent, CryptoReading } from './crypto-events.types';

export const MAX_CRYPTO_ROWS: number = 20_000;

const BINARY_MAGICS: readonly (readonly number[])[] = [
    [0x50, 0x4b],
    [0x25, 0x50, 0x44, 0x46],
    [0x89, 0x50, 0x4e, 0x47],
    [0xff, 0xd8, 0xff],
    [0x47, 0x49, 0x46, 0x38],
    [0x52, 0x49, 0x46, 0x46]
];

function isBinary(bytes: Uint8Array): boolean {
    return BINARY_MAGICS.some((magic: readonly number[]): boolean =>
        magic.every((value: number, index: number): boolean => bytes[index] === value)
    );
}

function tableOf(bytes: Uint8Array): RawTable {
    const scan: DelimitedRows = readDelimitedRows(bytes, MAX_CRYPTO_ROWS);
    if (scan.overflow) {
        throw new ReportTooLargeError(MAX_CRYPTO_ROWS);
    }
    return { name: '', rows: scan.rows.map((row: DelimitedRow): RawRow => ({ line: row.line, cells: row.cells })) };
}

export function readCryptoCsv(bytes: Uint8Array): CryptoReading | null {
    if (isBinary(bytes)) {
        return null;
    }
    const table: RawTable = tableOf(bytes);
    const sheet: CryptoSheet | null = detectCryptoSheet(table);
    if (sheet === null) {
        return null;
    }
    const collected: Collected<CryptoEvent> = sheet.parse();
    return { exchange: sheet.exchange, events: collected.items, ignored: collected.ignored, rejected: collected.rejected };
}
