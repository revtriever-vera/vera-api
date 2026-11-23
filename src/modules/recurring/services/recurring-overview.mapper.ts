import { FinancialAccount } from '../../transactions/services/financial-account.service';
import { ALERT_KINDS, AlertData, AlertRecord } from '../domain/recurring-alerts.types';
import { monthlyEquivalent, nextChargeDate, Occurrence, upcomingOccurrences } from '../domain/recurring-schedule';
import { RecurringSeriesRecord, SERIES_STATUSES } from '../domain/recurring-series.types';
import { TimeAlert } from '../domain/time-alerts';
import { AlertView, CalendarEntryView, ItemView } from '../validation/recurring.schemas';
import { toSeriesView } from './recurring-view.mapper';

export type AccountIndex = ReadonlyMap<string, FinancialAccount>;
export type ChargeLine = ItemView['lastCharges'][number];

const UNKNOWN_ACCOUNT: string = '';
const OTHER_KIND: string = 'other';

function isLive(record: RecurringSeriesRecord): boolean {
    return record.status === SERIES_STATUSES.confirmed || record.status === SERIES_STATUSES.suggested;
}

function accountNameOf(accounts: AccountIndex, id: string): string {
    return accounts.get(id)?.name ?? UNKNOWN_ACCOUNT;
}

export function toItemView(
    record: RecurringSeriesRecord,
    accounts: AccountIndex,
    today: string,
    lastCharges: readonly ChargeLine[]
): ItemView {
    const account: FinancialAccount | undefined = accounts.get(record.accountId);
    return {
        ...toSeriesView(record),
        accountName: account?.name ?? UNKNOWN_ACCOUNT,
        institutionName: account?.institutionName ?? null,
        accountKind: account?.kind ?? OTHER_KIND,
        nextDate: isLive(record) ? nextChargeDate(record, today) : null,
        monthlyEquivalentMinor: monthlyEquivalent(record.typicalAmountMinor, record.cadence),
        lastCharges: [...lastCharges]
    };
}

function enrichedData(alert: AlertRecord | TimeAlert, accounts: AccountIndex): AlertData {
    if (alert.kind !== ALERT_KINDS.duplicateAccount) {
        return alert.data;
    }
    return {
        ...alert.data,
        accountName: accountNameOf(accounts, String(alert.data['accountId'] ?? '')),
        otherAccountName: accountNameOf(accounts, String(alert.data['otherAccountId'] ?? ''))
    };
}

export function toAlertView(alert: AlertRecord | TimeAlert, names: ReadonlyMap<string, string>, accounts: AccountIndex): AlertView {
    return {
        id: alert.id,
        kind: alert.kind,
        seriesId: alert.seriesId,
        seriesName: names.get(alert.seriesId) ?? '',
        occurredOn: alert.occurredOn,
        canMarkSeen: 'seenAt' in alert,
        data: enrichedData(alert, accounts)
    };
}

export function toCalendarEntries(record: RecurringSeriesRecord, accounts: AccountIndex, today: string, days: number): CalendarEntryView[] {
    const account: FinancialAccount | undefined = accounts.get(record.accountId);
    return upcomingOccurrences(record, today, days).map((occurrence: Occurrence): CalendarEntryView => ({
        date: occurrence.date,
        state: occurrence.state,
        seriesId: record.id,
        name: record.name,
        amountMinor: record.typicalAmountMinor,
        isEstimate: record.valueMode === 'variable',
        isSuggestion: record.status === SERIES_STATUSES.suggested,
        accountId: record.accountId,
        accountName: account?.name ?? UNKNOWN_ACCOUNT,
        institutionName: account?.institutionName ?? null,
        accountKind: account?.kind ?? OTHER_KIND
    }));
}
