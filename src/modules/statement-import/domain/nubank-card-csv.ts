import { headerKey } from './format-detector';
import { CsvRecord } from './csv-reader';
import { assertHeader, cellOf, RowDraft, statementOf } from './parsed-statement';
import { IMPORT_FORMATS, ParsedStatement } from './statement-import.types';
import { parseAmountMinor, parseDateWith } from './statement-values';

const HEADER: string = 'date,title,amount';
const DATE_COLUMN: number = 0;
const TITLE_COLUMN: number = 1;
const AMOUNT_COLUMN: number = 2;

function draftOf(record: CsvRecord, currency: string): RowDraft {
    const amount: number | null = parseAmountMinor(cellOf(record, AMOUNT_COLUMN), '.', currency);
    return {
        line: record.line,
        date: parseDateWith(cellOf(record, DATE_COLUMN), 'yyyy-MM-dd'),
        amountMinor: amount === null || amount === 0 ? amount : -amount,
        description: cellOf(record, TITLE_COLUMN)
    };
}

export function parseNubankCardCsv(records: readonly CsvRecord[], currency: string): ParsedStatement {
    const [header, ...body] = records;
    assertHeader(header, (cells: readonly string[]): boolean => headerKey(cells.join(',')) === HEADER);
    return statementOf(
        IMPORT_FORMATS.csvNubankCard,
        body.map((record: CsvRecord): RowDraft => draftOf(record, currency))
    );
}
