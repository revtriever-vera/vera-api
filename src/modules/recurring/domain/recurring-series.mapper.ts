import { DateUtil } from '../../../shared/utils/date.util';
import { RecurringSeriesRecord, SeriesKind, SeriesOrigin, SeriesRow, SeriesStatus, StoppedBy } from './recurring-series.types';
import { Cadence, DayChange, ValueMode } from './recurring.types';

type Identity = Pick<
    RecurringSeriesRecord,
    'id' | 'name' | 'merchantKey' | 'accountId' | 'cadence' | 'valueMode' | 'kind' | 'status' | 'origin' | 'knownSubscription'
>;
type Amounts = Pick<RecurringSeriesRecord, 'typicalAmountMinor' | 'minAmountMinor' | 'maxAmountMinor' | 'expectedDay' | 'dayChange'>;
type Dates = Pick<
    RecurringSeriesRecord,
    'firstDate' | 'lastDate' | 'snoozedUntil' | 'confirmedAt' | 'dismissedAt' | 'stoppedAt' | 'stoppedBy' | 'createdAt' | 'updatedAt'
>;

function dayChangeOf(row: SeriesRow): DayChange | null {
    return row.dayChangeFrom === null || row.dayChangeTo === null ? null : { fromDay: row.dayChangeFrom, toDay: row.dayChangeTo };
}

function dateOf(value: Date | null): string | null {
    return value === null ? null : DateUtil.onlyLocalDateString(new Date(value));
}

function timeOf(value: Date | null): Date | null {
    return value === null ? null : new Date(value);
}

function identityOf(row: SeriesRow): Identity {
    return {
        id: row.id,
        name: row.name,
        merchantKey: row.merchantKey,
        accountId: row.accountId,
        cadence: row.cadence as Cadence,
        valueMode: row.valueMode as ValueMode,
        kind: row.kind as SeriesKind,
        status: row.status as SeriesStatus,
        origin: row.origin as SeriesOrigin,
        knownSubscription: row.knownSubscription
    };
}

function amountsOf(row: SeriesRow): Amounts {
    return {
        typicalAmountMinor: Number(row.typicalAmountMinor),
        minAmountMinor: Number(row.minAmountMinor),
        maxAmountMinor: Number(row.maxAmountMinor),
        expectedDay: row.expectedDay,
        dayChange: dayChangeOf(row)
    };
}

function datesOf(row: SeriesRow): Dates {
    return {
        firstDate: dateOf(row.firstDate) ?? '',
        lastDate: dateOf(row.lastDate) ?? '',
        snoozedUntil: dateOf(row.snoozedUntil),
        confirmedAt: timeOf(row.confirmedAt),
        dismissedAt: timeOf(row.dismissedAt),
        stoppedAt: timeOf(row.stoppedAt),
        stoppedBy: row.stoppedBy as StoppedBy | null,
        createdAt: new Date(row.createdAt),
        updatedAt: new Date(row.updatedAt)
    };
}

export function toRecord(row: SeriesRow): RecurringSeriesRecord {
    return { ...identityOf(row), ...amountsOf(row), ...datesOf(row) };
}
