import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { spreadsheetSafeText } from '../../../shared/spreadsheet/spreadsheet-safe-text';
import { XlsxCell, XlsxColumn } from '../../../shared/spreadsheet/xlsx';
import { AccountSpreadsheetExporterPort, SpreadsheetSheet } from '../../identity/services/account-spreadsheet-exporter.port';
import { CalendarConnectionDomain } from '../domain/calendar-connection.domain';
import { accessFromScopes } from '../domain/calendar-access';
import { CALENDAR_SPREADSHEET_LABELS, CalendarSpreadsheetLabels } from '../domain/calendar-spreadsheet-labels';
import { CalendarConnection } from '../domain/calendar.types';

export const CALENDAR_SPREADSHEET_FILE: string = 'agenda';

const PAGE: number = 500;
const COLUMN_WIDTHS: readonly number[] = [34, 20, 22, 22, 22];

@Injectable()
export class CalendarAccountSpreadsheet extends AccountSpreadsheetExporterPort {
    public readonly name: string = 'calendar';

    public constructor(
        private readonly connections: CalendarConnectionDomain,
        private readonly context: AppContext
    ) {
        super();
    }

    public async sheets(): Promise<readonly SpreadsheetSheet[]> {
        const labels: CalendarSpreadsheetLabels = CALENDAR_SPREADSHEET_LABELS[this.context.get().locale];
        const rows: CalendarConnection[] = await this.all();
        return [
            {
                file: CALENDAR_SPREADSHEET_FILE,
                name: labels.sheet,
                columns: this.columnsOf(labels),
                rows: rows.map((row: CalendarConnection): XlsxCell[] => this.rowOf(row, labels))
            }
        ];
    }

    private rowOf(row: CalendarConnection, labels: CalendarSpreadsheetLabels): XlsxCell[] {
        const access: string = accessFromScopes(row.scopes) ?? 'read_only';
        return [
            spreadsheetSafeText(row.googleEmail),
            labels.statuses[row.status] ?? row.status,
            labels.accesses[access] ?? access,
            row.connectedAt,
            row.disconnectedAt
        ];
    }

    private async all(): Promise<CalendarConnection[]> {
        const all: CalendarConnection[] = [];
        let page: CalendarConnection[] = await this.connections.listAll(0, PAGE);
        while (page.length > 0) {
            all.push(...page);
            page = await this.connections.listAll(all.length, PAGE);
        }
        return all;
    }

    private columnsOf(labels: CalendarSpreadsheetLabels): XlsxColumn[] {
        const headers: readonly (readonly [string, XlsxColumn['type']])[] = [
            [labels.headers.email, 'text'],
            [labels.headers.status, 'text'],
            [labels.headers.access, 'text'],
            [labels.headers.connectedAt, 'date'],
            [labels.headers.disconnectedAt, 'date']
        ];
        return headers.map(([header, type]: readonly [string, XlsxColumn['type']], index: number): XlsxColumn => ({
            header,
            type,
            width: COLUMN_WIDTHS[index] as number
        }));
    }
}
