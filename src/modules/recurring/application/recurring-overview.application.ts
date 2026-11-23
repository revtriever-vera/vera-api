import { Injectable } from '@nestjs/common';
import { CompanyTimezoneService } from '../../identity/services/company-timezone.service';
import { FinancialAccount, FinancialAccountService } from '../../transactions/services/financial-account.service';
import { RecurrenceTransaction, TransactionReaderService } from '../../transactions/services/transaction-reader.service';
import { RecurringAlertsDomain } from '../domain/recurring-alerts.domain';
import { AlertRecord, SeriesCharges } from '../domain/recurring-alerts.types';
import { RecurringSeriesDomain } from '../domain/recurring-series.domain';
import { RecurringSeriesRecord, SERIES_STATUSES } from '../domain/recurring-series.types';
import { deriveTimeAlerts, TimeAlert, TimeAlertInput } from '../domain/time-alerts';
import { computeTotals, isToReview } from '../domain/recurring-totals';
import { AccountIndex, ChargeLine, toAlertView, toCalendarEntries, toItemView } from '../services/recurring-overview.mapper';
import { AlertView, CalendarEntryView, ItemView, OverviewView } from '../validation/recurring.schemas';
import { DateUtil } from '../../../shared/utils/date.util';

const LAST_CHARGES_SHOWN: number = 3;

type AlertSource = AlertRecord | TimeAlert;

function byOccurrence(left: AlertSource, right: AlertSource): number {
    return right.occurredOn.localeCompare(left.occurredOn) || left.id.localeCompare(right.id);
}

function byName(left: RecurringSeriesRecord, right: RecurringSeriesRecord): number {
    return left.name.localeCompare(right.name);
}

@Injectable()
export class RecurringOverviewApplication {
    public constructor(
        private readonly series: RecurringSeriesDomain,
        private readonly alerts: RecurringAlertsDomain,
        private readonly accounts: FinancialAccountService,
        private readonly reader: TransactionReaderService,
        private readonly timezones: CompanyTimezoneService
    ) {}

    public async overview(): Promise<OverviewView> {
        const today: string = await this.timezones.todayInCompany();
        const records: RecurringSeriesRecord[] = await this.series.list();
        const accounts: AccountIndex = await this.accountIndex(records);
        const toReview: RecurringSeriesRecord[] = records.filter((record: RecurringSeriesRecord): boolean => isToReview(record, today));
        const lastCharges: Map<string, ChargeLine[]> = await this.lastChargesOf(toReview);
        const items: (list: readonly RecurringSeriesRecord[]) => ItemView[] = (list: readonly RecurringSeriesRecord[]): ItemView[] =>
            list
                .toSorted(byName)
                .map((record: RecurringSeriesRecord): ItemView => toItemView(record, accounts, today, lastCharges.get(record.id) ?? []));
        const withStatus: (status: string) => ItemView[] = (status: string): ItemView[] =>
            items(records.filter((record: RecurringSeriesRecord): boolean => record.status === status));
        return {
            totals: computeTotals(records, today),
            review: items(toReview),
            confirmed: withStatus(SERIES_STATUSES.confirmed),
            stopped: withStatus(SERIES_STATUSES.stopped),
            dismissed: withStatus(SERIES_STATUSES.dismissed),
            alerts: await this.alertViews(records, accounts, today)
        };
    }

    public async calendar(days: number): Promise<CalendarEntryView[]> {
        const today: string = await this.timezones.todayInCompany();
        const records: RecurringSeriesRecord[] = (await this.series.list()).filter(
            (record: RecurringSeriesRecord): boolean =>
                record.status === SERIES_STATUSES.confirmed || record.status === SERIES_STATUSES.suggested
        );
        const accounts: AccountIndex = await this.accountIndex(records);
        return records
            .flatMap((record: RecurringSeriesRecord): CalendarEntryView[] => toCalendarEntries(record, accounts, today, days))
            .toSorted(
                (left: CalendarEntryView, right: CalendarEntryView): number =>
                    left.date.localeCompare(right.date) || left.name.localeCompare(right.name)
            );
    }

    private async accountIndex(records: readonly RecurringSeriesRecord[]): Promise<AccountIndex> {
        const ids: string[] = [...new Set<string>(records.map((record: RecurringSeriesRecord): string => record.accountId))];
        const found: FinancialAccount[] = await this.accounts.findByIds(ids);
        return new Map<string, FinancialAccount>(
            found.map((account: FinancialAccount): [string, FinancialAccount] => [account.id, account])
        );
    }

    private async lastChargesOf(records: readonly RecurringSeriesRecord[]): Promise<Map<string, ChargeLine[]>> {
        const charges: Map<string, SeriesCharges> = await this.series.chargesBySeries(
            records.map((record: RecurringSeriesRecord): string => record.id)
        );
        const ids: string[] = [...charges.values()].flatMap((entry: SeriesCharges): string[] => entry.chargeIds);
        const rows: Map<string, RecurrenceTransaction> = new Map<string, RecurrenceTransaction>(
            (await this.reader.findForRecurrence(ids)).map((row: RecurrenceTransaction): [string, RecurrenceTransaction] => [row.id, row])
        );
        const lines: Map<string, ChargeLine[]> = new Map<string, ChargeLine[]>();
        for (const [seriesId, entry] of charges) {
            lines.set(seriesId, this.linesOf(entry.chargeIds, rows));
        }
        return lines;
    }

    private linesOf(ids: readonly string[], rows: ReadonlyMap<string, RecurrenceTransaction>): ChargeLine[] {
        const found: ChargeLine[] = [];
        for (const id of ids) {
            const row: RecurrenceTransaction | undefined = rows.get(id);
            if (row !== undefined) {
                found.push({ transactionId: row.id, date: row.date, amountMinor: -row.amountMinor });
            }
        }
        return found
            .toSorted((left: ChargeLine, right: ChargeLine): number => right.date.localeCompare(left.date))
            .slice(0, LAST_CHARGES_SHOWN);
    }

    private async alertViews(records: readonly RecurringSeriesRecord[], accounts: AccountIndex, today: string): Promise<AlertView[]> {
        const names: Map<string, string> = new Map<string, string>(
            records.map((record: RecurringSeriesRecord): [string, string] => [record.id, record.name])
        );
        const stored: AlertRecord[] = (await this.alerts.list()).filter(
            (alert: AlertRecord): boolean => alert.seenAt === null && names.has(alert.seriesId)
        );
        const computed: TimeAlert[] = deriveTimeAlerts(await this.timeInputs(records), today);
        return [...stored, ...computed].sort(byOccurrence).map((alert: AlertSource): AlertView => toAlertView(alert, names, accounts));
    }

    private async timeInputs(records: readonly RecurringSeriesRecord[]): Promise<TimeAlertInput[]> {
        const timezone: string = await this.timezones.timezoneOfCompany();
        const suggested: RecurringSeriesRecord[] = records.filter(
            (record: RecurringSeriesRecord): boolean => record.status === SERIES_STATUSES.suggested
        );
        const charges: Map<string, SeriesCharges> = await this.series.chargesBySeries(
            suggested.map((record: RecurringSeriesRecord): string => record.id)
        );
        const inputs: TimeAlertInput[] = [];
        for (const record of records) {
            inputs.push({
                series: record,
                createdOn: DateUtil.localDateIn(timezone, record.createdAt),
                chargeCount: charges.get(record.id)?.chargeIds.length ?? 0
            });
        }
        return inputs;
    }
}
