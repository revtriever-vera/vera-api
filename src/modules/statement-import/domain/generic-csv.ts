import { CsvRecord } from './csv-reader';
import { cellOf, RowDraft, statementOf } from './parsed-statement';
import { CsvMapping, IMPORT_FORMATS, ParsedStatement } from './statement-import.types';
import { parseAmountMinor, parseDateWith } from './statement-values';

export function columnsOf(first: CsvRecord | undefined, hasHeader: boolean): string[] {
    const cells: readonly string[] = first?.cells ?? [];
    return cells.map((cell: string, index: number): string =>
        hasHeader && cell.trim() !== '' ? cell.trim() : `Coluna ${String(index + 1)}`
    );
}

function splitColumn(raw: string, mapping: CsvMapping, currency: string): number | null {
    return raw === '' ? 0 : parseAmountMinor(raw, mapping.decimalSeparator, currency);
}

function ledgerAmount(record: CsvRecord, mapping: CsvMapping, currency: string): number | null {
    const debitRaw: string = cellOf(record, mapping.debitColumn);
    const creditRaw: string = cellOf(record, mapping.creditColumn);
    const debit: number | null = splitColumn(debitRaw, mapping, currency);
    const credit: number | null = splitColumn(creditRaw, mapping, currency);
    if ((debitRaw === '' && creditRaw === '') || debit === null || credit === null) {
        return null;
    }
    return Math.abs(credit) - Math.abs(debit);
}

function amountOf(record: CsvRecord, mapping: CsvMapping, currency: string): number | null {
    const amount: number | null =
        mapping.amountColumn === undefined
            ? ledgerAmount(record, mapping, currency)
            : parseAmountMinor(cellOf(record, mapping.amountColumn), mapping.decimalSeparator, currency);
    return amount === null || !mapping.invertSign || amount === 0 ? amount : -amount;
}

function draftOf(record: CsvRecord, mapping: CsvMapping, currency: string): RowDraft {
    return {
        line: record.line,
        date: parseDateWith(cellOf(record, mapping.dateColumn), mapping.dateFormat),
        amountMinor: amountOf(record, mapping, currency),
        description: cellOf(record, mapping.descriptionColumn)
    };
}

export function parseGenericCsv(records: readonly CsvRecord[], mapping: CsvMapping, currency: string): ParsedStatement {
    const body: readonly CsvRecord[] = mapping.hasHeader ? records.slice(1) : records;
    return statementOf(
        IMPORT_FORMATS.csvGeneric,
        body.map((record: CsvRecord): RowDraft => draftOf(record, mapping, currency)),
        { columns: columnsOf(records[0], mapping.hasHeader) }
    );
}

export function describeGenericCsv(records: readonly CsvRecord[]): ParsedStatement {
    return statementOf(IMPORT_FORMATS.csvGeneric, [], {
        columns: columnsOf(records[0], true),
        pendingMappingRecords: Math.max(records.length - 1, 0)
    });
}
