import { RecurringSeriesRecord } from '../domain/recurring-series.types';
import { SeriesView } from '../validation/recurring.schemas';

function isoOf(value: Date | null): string | null {
    return value === null ? null : value.toISOString();
}

type Shape = Pick<
    SeriesView,
    'id' | 'name' | 'merchantKey' | 'accountId' | 'cadence' | 'valueMode' | 'kind' | 'status' | 'origin' | 'knownSubscription'
>;
type Money = Pick<SeriesView, 'typicalAmountMinor' | 'minAmountMinor' | 'maxAmountMinor' | 'expectedDay' | 'dayChange'>;
type Timeline = Pick<
    SeriesView,
    'firstDate' | 'lastDate' | 'snoozedUntil' | 'confirmedAt' | 'dismissedAt' | 'stoppedAt' | 'stoppedBy' | 'createdAt' | 'updatedAt'
>;

function shapeOf(record: RecurringSeriesRecord): Shape {
    return {
        id: record.id,
        name: record.name,
        merchantKey: record.merchantKey,
        accountId: record.accountId,
        cadence: record.cadence,
        valueMode: record.valueMode,
        kind: record.kind,
        status: record.status,
        origin: record.origin,
        knownSubscription: record.knownSubscription
    };
}

function moneyOf(record: RecurringSeriesRecord): Money {
    return {
        typicalAmountMinor: record.typicalAmountMinor,
        minAmountMinor: record.minAmountMinor,
        maxAmountMinor: record.maxAmountMinor,
        expectedDay: record.expectedDay,
        dayChange: record.dayChange
    };
}

function timelineOf(record: RecurringSeriesRecord): Timeline {
    return {
        firstDate: record.firstDate,
        lastDate: record.lastDate,
        snoozedUntil: record.snoozedUntil,
        confirmedAt: isoOf(record.confirmedAt),
        dismissedAt: isoOf(record.dismissedAt),
        stoppedAt: isoOf(record.stoppedAt),
        stoppedBy: record.stoppedBy,
        createdAt: record.createdAt.toISOString(),
        updatedAt: record.updatedAt.toISOString()
    };
}

export function toSeriesView(record: RecurringSeriesRecord): SeriesView {
    return { ...shapeOf(record), ...moneyOf(record), ...timelineOf(record) };
}
