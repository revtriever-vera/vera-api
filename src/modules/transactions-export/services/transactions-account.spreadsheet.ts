import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { AppLocale } from '../../../shared/i18n/locale';
import { XlsxCell } from '../../../shared/spreadsheet/xlsx';
import { AccountSpreadsheetExporterPort, SpreadsheetSheet } from '../../identity/services/account-spreadsheet-exporter.port';
import { CategoryReaderService } from '../../spending-categories/services/category-reader.service';
import { TransactionReaderService } from '../../transactions/services/transaction-reader.service';
import { columnsOf, xlsxCellsOf } from '../domain/export-columns';
import { sheetNameOf } from '../domain/export-labels';
import { categoryLabelsOf, exportRowsOf } from '../domain/export-rows';
import { MAX_EXPORT_ROWS, TransactionExportRow, TransactionFilter } from '../domain/transactions-export.types';

export const TRANSACTIONS_SPREADSHEET_FILE: string = 'transacoes';

const FIRST_DAY: string = '1900-01-01';
const LAST_DAY: string = '2999-12-31';

@Injectable()
export class TransactionsAccountSpreadsheet extends AccountSpreadsheetExporterPort {
    public readonly name: string = 'transactions';

    public constructor(
        private readonly reader: TransactionReaderService,
        private readonly categories: CategoryReaderService,
        private readonly context: AppContext
    ) {
        super();
    }

    public async sheets(): Promise<readonly SpreadsheetSheet[]> {
        const locale: AppLocale = this.context.get().locale;
        const filter: TransactionFilter = { fromDate: FIRST_DAY, toDate: LAST_DAY, excludeSamples: true };
        const parts: number = Math.max(1, Math.ceil((await this.reader.countForExport(filter)) / MAX_EXPORT_ROWS));
        const rows: AsyncIterator<TransactionExportRow> = exportRowsOf(
            this.reader.pagesForExport(filter),
            categoryLabelsOf(await this.categories.listForCompany(), locale),
            locale
        );
        return Array.from({ length: parts }, (_unused: unknown, index: number): SpreadsheetSheet => ({
            file: index === 0 ? TRANSACTIONS_SPREADSHEET_FILE : `${TRANSACTIONS_SPREADSHEET_FILE}-${String(index + 1)}`,
            name: sheetNameOf(locale),
            columns: columnsOf(locale),
            rows: this.partOf(rows, index === parts - 1 ? Number.POSITIVE_INFINITY : MAX_EXPORT_ROWS)
        }));
    }

    private async *partOf(rows: AsyncIterator<TransactionExportRow>, limit: number): AsyncGenerator<XlsxCell[]> {
        for (let taken: number = 0; taken < limit; taken += 1) {
            const next: IteratorResult<TransactionExportRow> = await rows.next();
            if (next.done === true) {
                return;
            }
            yield xlsxCellsOf(next.value);
        }
    }
}
