import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { decimalValueOf } from '../../../shared/spreadsheet/csv';
import { spreadsheetSafeText } from '../../../shared/spreadsheet/spreadsheet-safe-text';
import { currencyFormatOf, XlsxCell, XlsxColumn } from '../../../shared/spreadsheet/xlsx';
import { DecimalUtil } from '../../../shared/utils/decimal.util';
import { AccountSpreadsheetExporterPort, SpreadsheetSheet } from '../../identity/services/account-spreadsheet-exporter.port';
import { FinancialAccount, FinancialAccountService } from '../../transactions/services/financial-account.service';
import { RECURRING_SPREADSHEET_LABELS, RecurringSpreadsheetLabels } from '../domain/recurring-spreadsheet-labels';
import { monthlyEquivalent } from '../domain/recurring-schedule';
import { RecurringSeriesDomain } from '../domain/recurring-series.domain';
import { RecurringSeriesRecord } from '../domain/recurring-series.types';

export const RECURRING_SPREADSHEET_FILE: string = 'assinaturas-e-contas';

const CURRENCY: string = 'BRL';
const COLUMN_TYPES: readonly XlsxColumn['type'][] = ['text', 'text', 'text', 'number', 'number', 'text', 'text', 'number', 'text'];
const COLUMN_WIDTHS: readonly number[] = [30, 14, 14, 8, 16, 22, 16, 20, 26];

function moneyOf(amountMinor: number): XlsxCell {
    return { value: DecimalUtil.of(decimalValueOf(amountMinor, CURRENCY)).toNumber(), numFmt: currencyFormatOf(CURRENCY) };
}

@Injectable()
export class RecurringAccountSpreadsheet extends AccountSpreadsheetExporterPort {
    public readonly name: string = 'recurring';

    public constructor(
        private readonly series: RecurringSeriesDomain,
        private readonly accounts: FinancialAccountService,
        private readonly context: AppContext
    ) {
        super();
    }

    public async sheets(): Promise<readonly SpreadsheetSheet[]> {
        const labels: RecurringSpreadsheetLabels = RECURRING_SPREADSHEET_LABELS[this.context.get().locale];
        const accounts: ReadonlyMap<string, FinancialAccount> = new Map<string, FinancialAccount>(
            (await this.accounts.list()).map((account: FinancialAccount): [string, FinancialAccount] => [account.id, account])
        );
        const rows: XlsxCell[][] = (await this.series.list())
            .filter((record: RecurringSeriesRecord): boolean => accounts.get(record.accountId)?.isSample === false)
            .map((record: RecurringSeriesRecord): XlsxCell[] => this.rowOf(record, labels, accounts));
        return [{ file: RECURRING_SPREADSHEET_FILE, name: labels.sheet, columns: this.columnsOf(labels), rows }];
    }

    private columnsOf(labels: RecurringSpreadsheetLabels): XlsxColumn[] {
        return labels.headers.map((header: string, index: number): XlsxColumn => ({
            header,
            type: COLUMN_TYPES[index] as XlsxColumn['type'],
            width: COLUMN_WIDTHS[index] as number
        }));
    }

    private rowOf(
        record: RecurringSeriesRecord,
        labels: RecurringSpreadsheetLabels,
        accounts: ReadonlyMap<string, FinancialAccount>
    ): XlsxCell[] {
        return [
            spreadsheetSafeText(record.name),
            labels.kinds[record.kind] ?? record.kind,
            labels.cadences[record.cadence] ?? record.cadence,
            record.expectedDay,
            moneyOf(record.typicalAmountMinor),
            labels.valueModes[record.valueMode] ?? record.valueMode,
            labels.statuses[record.status] ?? record.status,
            moneyOf(monthlyEquivalent(record.typicalAmountMinor, record.cadence)),
            spreadsheetSafeText(accounts.get(record.accountId)?.name ?? '')
        ];
    }
}
