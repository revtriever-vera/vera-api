import { headerKey } from './format-detector';
import { CsvRecord } from './csv-reader';
import { assertHeader, cellOf, RowDraft, statementOf } from './parsed-statement';
import { EXTERNAL_ID_MAX_LENGTH, IMPORT_FORMATS, ParsedStatement } from './statement-import.types';
import { parseAmountMinor, parseDateWith } from './statement-values';

const HEADER: string = 'data,valor,identificador,descricao';
const DATE_COLUMN: number = 0;
const AMOUNT_COLUMN: number = 1;
const IDENTIFIER_COLUMN: number = 2;
const DESCRIPTION_COLUMN: number = 3;

function identifierOf(record: CsvRecord): string | null {
    const identifier: string = cellOf(record, IDENTIFIER_COLUMN);
    return identifier === '' || identifier.length > EXTERNAL_ID_MAX_LENGTH ? null : `csv:nubank:${identifier}`;
}

function draftOf(record: CsvRecord, currency: string): RowDraft {
    return {
        line: record.line,
        date: parseDateWith(cellOf(record, DATE_COLUMN), 'dd/MM/yyyy'),
        amountMinor: parseAmountMinor(cellOf(record, AMOUNT_COLUMN), '.', currency),
        description: cellOf(record, DESCRIPTION_COLUMN),
        externalId: identifierOf(record)
    };
}

export function parseNubankAccountCsv(records: readonly CsvRecord[], currency: string): ParsedStatement {
    const [header, ...body] = records;
    assertHeader(header, (cells: readonly string[]): boolean => headerKey(cells.join(',')) === HEADER);
    return statementOf(
        IMPORT_FORMATS.csvNubankAccount,
        body.map((record: CsvRecord): RowDraft => draftOf(record, currency))
    );
}
