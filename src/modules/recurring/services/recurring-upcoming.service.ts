import { Injectable } from '@nestjs/common';
import { CompanyTimezoneService } from '../../identity/services/company-timezone.service';
import { FinancialAccount, FinancialAccountService } from '../../transactions/services/financial-account.service';
import { RecurringAlertsDomain } from '../domain/recurring-alerts.domain';
import { ALERT_KINDS, AlertData, AlertKind, AlertRecord } from '../domain/recurring-alerts.types';
import { addDaysTo } from '../domain/recurring-dates';
import { RecurringSeriesDomain } from '../domain/recurring-series.domain';
import { RecurringSeriesRecord, SERIES_KINDS, SERIES_STATUSES } from '../domain/recurring-series.types';
import { computeTotals } from '../domain/recurring-totals';
import { upcomingOccurrences } from '../domain/recurring-schedule';

const CREDIT_CARD: string = 'credit_card';
const WATCHED_ALERT_KINDS: ReadonlySet<AlertKind> = new Set<AlertKind>([
    ALERT_KINDS.priceIncrease,
    ALERT_KINDS.duplicateCharge,
    ALERT_KINDS.duplicateAccount
]);

export interface UpcomingDebit {
    readonly seriesId: string;
    readonly name: string;
    readonly date: string;
    readonly amountMinor: number;
    readonly isEstimate: boolean;
    readonly accountName: string;
    readonly onCreditCard: boolean;
    readonly lastDate: string;
}

export interface RecentAlert {
    readonly kind: AlertKind;
    readonly seriesName: string;
    readonly occurredOn: string;
    readonly data: AlertData;
}

export interface RecurringTotalsSummary {
    readonly monthlyMinor: number;
    readonly yearlyMinor: number;
    readonly subscriptionCount: number;
    readonly subscriptionMonthlyMinor: number;
}

function upcomingDatesOf(record: RecurringSeriesRecord, today: string, days: number): string[] {
    const dates: string[] = [];
    for (const occurrence of upcomingOccurrences(record, today, days)) {
        if (occurrence.state === 'upcoming') {
            dates.push(occurrence.date);
        }
    }
    return dates;
}

function byDateThenName(left: UpcomingDebit, right: UpcomingDebit): number {
    return left.date.localeCompare(right.date) || left.name.localeCompare(right.name);
}

@Injectable()
export class RecurringUpcomingService {
    public constructor(
        private readonly series: RecurringSeriesDomain,
        private readonly alerts: RecurringAlertsDomain,
        private readonly accounts: FinancialAccountService,
        private readonly timezones: CompanyTimezoneService
    ) {}

    public async companyIdsWithConfirmedAcrossTenants(): Promise<string[]> {
        return this.series.companyIdsWithConfirmedAcrossTenants();
    }

    public async debitsFrom(today: string, days: number): Promise<UpcomingDebit[]> {
        const confirmed: RecurringSeriesRecord[] = await this.confirmed();
        const accounts: ReadonlyMap<string, FinancialAccount> = await this.accountIndex(confirmed);
        return confirmed
            .flatMap((record: RecurringSeriesRecord): UpcomingDebit[] => this.debitsOf(record, today, days, accounts))
            .toSorted(byDateThenName);
    }

    public async debitOfSeriesOn(seriesId: string, date: string): Promise<UpcomingDebit | null> {
        const today: string = await this.timezones.todayInCompany();
        const found: UpcomingDebit | undefined = (await this.debitsFrom(today, 2)).find(
            (debit: UpcomingDebit): boolean => debit.seriesId === seriesId && debit.date === date
        );
        return found ?? null;
    }

    public async recentAlerts(today: string, days: number): Promise<RecentAlert[]> {
        const since: string = addDaysTo(today, -days);
        const names: ReadonlyMap<string, string> = new Map<string, string>(
            (await this.confirmed()).map((record: RecurringSeriesRecord): [string, string] => [record.id, record.name])
        );
        return (await this.alerts.list())
            .filter(
                (alert: AlertRecord): boolean =>
                    alert.seenAt === null && WATCHED_ALERT_KINDS.has(alert.kind) && names.has(alert.seriesId) && alert.occurredOn >= since
            )
            .map((alert: AlertRecord): RecentAlert => ({
                kind: alert.kind,
                seriesName: names.get(alert.seriesId) ?? '',
                occurredOn: alert.occurredOn,
                data: alert.data
            }));
    }

    public async totals(today: string): Promise<RecurringTotalsSummary> {
        const records: RecurringSeriesRecord[] = await this.series.list();
        const totals: ReturnType<typeof computeTotals> = computeTotals(records, today);
        const subscriptions: RecurringSeriesRecord[] = records.filter(
            (record: RecurringSeriesRecord): boolean =>
                record.status === SERIES_STATUSES.confirmed && record.kind === SERIES_KINDS.subscription
        );
        return {
            monthlyMinor: totals.monthlyMinor,
            yearlyMinor: totals.yearlyMinor,
            subscriptionCount: subscriptions.length,
            subscriptionMonthlyMinor: totals.byKind.subscription
        };
    }

    public async isConfirmed(seriesId: string): Promise<boolean> {
        const record: RecurringSeriesRecord | null = await this.series.find(seriesId);
        return record?.status === SERIES_STATUSES.confirmed;
    }

    private async confirmed(): Promise<RecurringSeriesRecord[]> {
        return (await this.series.list()).filter((record: RecurringSeriesRecord): boolean => record.status === SERIES_STATUSES.confirmed);
    }

    private async accountIndex(records: readonly RecurringSeriesRecord[]): Promise<ReadonlyMap<string, FinancialAccount>> {
        const ids: string[] = [...new Set<string>(records.map((record: RecurringSeriesRecord): string => record.accountId))];
        return new Map<string, FinancialAccount>(
            (await this.accounts.findByIds(ids)).map((account: FinancialAccount): [string, FinancialAccount] => [account.id, account])
        );
    }

    private debitsOf(
        record: RecurringSeriesRecord,
        today: string,
        days: number,
        accounts: ReadonlyMap<string, FinancialAccount>
    ): UpcomingDebit[] {
        const dates: string[] = upcomingDatesOf(record, today, days);
        return dates.map((date: string): UpcomingDebit => this.debitOf(record, date, accounts));
    }

    private debitOf(record: RecurringSeriesRecord, date: string, accounts: ReadonlyMap<string, FinancialAccount>): UpcomingDebit {
        const account: FinancialAccount | undefined = accounts.get(record.accountId);
        return {
            seriesId: record.id,
            name: record.name,
            date,
            amountMinor: record.typicalAmountMinor,
            isEstimate: record.valueMode === 'variable',
            accountName: account?.name ?? '',
            onCreditCard: account?.kind === CREDIT_CARD,
            lastDate: record.lastDate
        };
    }
}
