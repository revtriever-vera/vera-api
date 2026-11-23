import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { AppLocale } from '../../../shared/i18n/locale';
import { spreadsheetSafeText } from '../../../shared/spreadsheet/spreadsheet-safe-text';
import { XlsxCell, XlsxColumn } from '../../../shared/spreadsheet/xlsx';
import { AccountSpreadsheetExporterPort, SpreadsheetSheet } from '../../identity/services/account-spreadsheet-exporter.port';
import { ReminderDomain } from '../domain/reminder.domain';
import { whenOf } from '../domain/reminder-texts';
import { REMINDERS_SPREADSHEET_LABELS, RemindersSpreadsheetLabels } from '../domain/reminders-spreadsheet-labels';
import { EXPORT_PAGE, Reminder } from '../domain/reminders.types';

export const REMINDERS_SPREADSHEET_FILE: string = 'lembretes';

const COLUMN_WIDTHS: readonly number[] = [40, 30, 14, 22, 14];

@Injectable()
export class RemindersAccountSpreadsheet extends AccountSpreadsheetExporterPort {
    public readonly name: string = 'reminders';

    public constructor(
        private readonly domain: ReminderDomain,
        private readonly context: AppContext
    ) {
        super();
    }

    public async sheets(): Promise<readonly SpreadsheetSheet[]> {
        const locale: AppLocale = this.context.get().locale;
        const labels: RemindersSpreadsheetLabels = REMINDERS_SPREADSHEET_LABELS[locale];
        const reminders: Reminder[] = await this.allReminders();
        const next: Map<string, Date> = await this.domain.nextAtOf(reminders.map((reminder: Reminder): string => reminder.id));
        const now: Date = new Date();
        return [
            {
                file: REMINDERS_SPREADSHEET_FILE,
                name: labels.sheet,
                columns: this.columnsOf(labels),
                rows: reminders.map((reminder: Reminder): XlsxCell[] => [
                    spreadsheetSafeText(reminder.text),
                    whenOf(reminder, locale, now),
                    labels.statuses[reminder.status] ?? reminder.status,
                    next.get(reminder.id) ?? null,
                    reminder.createdAt
                ])
            }
        ];
    }

    private async allReminders(): Promise<Reminder[]> {
        const all: Reminder[] = [];
        let page: Reminder[] = await this.domain.listAll(0, EXPORT_PAGE);
        while (page.length > 0) {
            all.push(...page);
            page = await this.domain.listAll(all.length, EXPORT_PAGE);
        }
        return all;
    }

    private columnsOf(labels: RemindersSpreadsheetLabels): XlsxColumn[] {
        const headers: readonly (readonly [string, XlsxColumn['type']])[] = [
            [labels.headers.text, 'text'],
            [labels.headers.when, 'text'],
            [labels.headers.status, 'text'],
            [labels.headers.nextAt, 'date'],
            [labels.headers.createdAt, 'date']
        ];
        return headers.map(([header, type]: readonly [string, XlsxColumn['type']], index: number): XlsxColumn => ({
            header,
            type,
            width: COLUMN_WIDTHS[index] as number
        }));
    }
}
