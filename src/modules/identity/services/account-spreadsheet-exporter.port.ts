import { XlsxCell, XlsxColumn } from '../../../shared/spreadsheet/xlsx';

export interface SpreadsheetSheet {
    readonly file: string;
    readonly name: string;
    readonly columns: readonly XlsxColumn[];
    readonly rows: Iterable<readonly XlsxCell[]> | AsyncIterable<readonly XlsxCell[]>;
}

export abstract class AccountSpreadsheetExporterPort {
    public abstract readonly name: string;
    public abstract sheets(): Promise<readonly SpreadsheetSheet[]>;
}
