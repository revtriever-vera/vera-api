import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { normalizeDescription } from '../../spending-categories/services/description-normalizer.service';
import { IngestionBatch } from '../../transactions/services/transaction-ingestion.service';
import { TransactionFingerprintService } from '../../transactions/services/transaction-fingerprint.service';
import { CsvDelimiter, CsvRecord, CsvScan, detectDelimiter, readCsv } from '../domain/csv-reader';
import { detectFormat, firstLineOf, isBinary } from '../domain/format-detector';
import { parseGenericCsv, describeGenericCsv } from '../domain/generic-csv';
import { parseNubankAccountCsv } from '../domain/nubank-account-csv';
import { parseNubankCardCsv } from '../domain/nubank-card-csv';
import { parseOfx } from '../domain/ofx-parser';
import { exceedsYears, periodOf } from '../domain/preview-builder';
import { FileTooLargeError, InvalidFileError, TooManyRowsError, UnsupportedFormatError } from '../domain/statement-import.errors';
import {
    CsvMapping,
    DEFAULT_CURRENCY,
    IMPORT_FORMATS,
    INVALID_FILE_REASONS,
    ImportFormat,
    MAX_FILE_BYTES,
    MAX_RANGE_YEARS,
    MAX_RAW_RECORDS,
    MAX_VALID_ROWS,
    ParsedRow,
    ParsedStatement
} from '../domain/statement-import.types';
import { decodeStatement } from '../domain/text-decoding';

type IncomingRow = IngestionBatch['items'][number];

export interface ParseOptions {
    readonly format?: ImportFormat;
    readonly mapping?: CsvMapping;
    readonly currency: string | null;
}

export interface ParsedFile {
    readonly statement: ParsedStatement;
    readonly detectedFormat: ImportFormat;
    readonly sha256: string;
    readonly sizeBytes: number;
}

const FINGERPRINT_PREFIX: string = 'csv:';
const PRESET_DELIMITER: CsvDelimiter = ',';

@Injectable()
export class StatementParserService {
    public constructor(private readonly fingerprints: TransactionFingerprintService) {}

    public parse(bytes: Buffer, options: ParseOptions): ParsedFile {
        if (bytes.length > MAX_FILE_BYTES) {
            throw new FileTooLargeError(MAX_FILE_BYTES);
        }
        const text: string = decodeStatement(bytes);
        const binary: boolean = isBinary(text);
        const detected: ImportFormat | null = binary ? null : detectFormat(text);
        const format: ImportFormat | null = binary ? null : (options.format ?? detected);
        if (format === null) {
            throw new UnsupportedFormatError();
        }
        const statement: ParsedStatement = this.read(text, format, options);
        this.assertLimits(statement);
        return {
            statement,
            detectedFormat: detected ?? format,
            sha256: createHash('sha256').update(bytes).digest('hex'),
            sizeBytes: bytes.length
        };
    }

    public toIncoming(rows: readonly ParsedRow[], accountId: string, currency: string): IncomingRow[] {
        const repeated: ReadonlySet<string> = repeatedIdentifiers(rows);
        const occurrences: Map<string, number> = new Map<string, number>();
        return rows.map((row: ParsedRow): IncomingRow => ({
            externalId:
                row.externalId !== null && !repeated.has(row.externalId) ? row.externalId : this.fingerprintOf(row, accountId, occurrences),
            date: row.date,
            amountMinor: row.amountMinor,
            currency,
            description: row.description
        }));
    }

    private fingerprintOf(row: ParsedRow, accountId: string, occurrences: Map<string, number>): string {
        const normalizedDescription: string = normalizeDescription(row.description);
        const key: string = `${row.date}|${String(row.amountMinor)}|${normalizedDescription}`;
        const occurrence: number = occurrences.get(key) ?? 0;
        occurrences.set(key, occurrence + 1);
        return `${FINGERPRINT_PREFIX}${this.fingerprints.of({ accountId, date: row.date, amountMinor: row.amountMinor, normalizedDescription, occurrence })}`;
    }

    private read(text: string, format: ImportFormat, options: ParseOptions): ParsedStatement {
        if (format === IMPORT_FORMATS.ofx) {
            return parseOfx(text, options.currency);
        }
        const delimiter: CsvDelimiter =
            format === IMPORT_FORMATS.csvGeneric ? (options.mapping?.delimiter ?? detectDelimiter(firstLineOf(text))) : PRESET_DELIMITER;
        const records: readonly CsvRecord[] = this.scan(text, delimiter);
        const currency: string = options.currency ?? DEFAULT_CURRENCY;
        if (format === IMPORT_FORMATS.csvNubankCard) {
            return parseNubankCardCsv(records, currency);
        }
        if (format === IMPORT_FORMATS.csvNubankAccount) {
            return parseNubankAccountCsv(records, currency);
        }
        return options.mapping === undefined ? describeGenericCsv(records) : parseGenericCsv(records, options.mapping, currency);
    }

    private scan(text: string, delimiter: CsvDelimiter): readonly CsvRecord[] {
        const scanned: CsvScan = readCsv(text, delimiter, MAX_RAW_RECORDS);
        if (scanned.overflow) {
            throw new TooManyRowsError(MAX_VALID_ROWS);
        }
        if (scanned.unterminatedQuote) {
            throw new InvalidFileError(INVALID_FILE_REASONS.unterminatedQuote);
        }
        return scanned.records;
    }

    private assertLimits(statement: ParsedStatement): void {
        if (statement.pendingMappingRecords !== null) {
            return;
        }
        if (statement.rows.length > MAX_VALID_ROWS) {
            throw new TooManyRowsError(MAX_VALID_ROWS);
        }
        if (statement.rows.length === 0) {
            throw new InvalidFileError(INVALID_FILE_REASONS.noValidRows);
        }
        const period: { start: string | null; end: string | null } = periodOf(statement.rows);
        if (period.start !== null && period.end !== null && exceedsYears(period.start, period.end, MAX_RANGE_YEARS)) {
            throw new InvalidFileError(INVALID_FILE_REASONS.dateRangeTooWide);
        }
    }
}

function repeatedIdentifiers(rows: readonly ParsedRow[]): Set<string> {
    const seen: Set<string> = new Set<string>();
    const repeated: Set<string> = new Set<string>();
    for (const row of rows) {
        if (row.externalId !== null && seen.has(row.externalId)) {
            repeated.add(row.externalId);
        }
        if (row.externalId !== null) {
            seen.add(row.externalId);
        }
    }
    return repeated;
}
