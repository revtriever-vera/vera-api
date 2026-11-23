import {
    ALERT_KINDS,
    AlertData,
    AlertKind,
    RENEWAL_WINDOW_DAYS,
    STILL_USING_MIN_CHARGES,
    STILL_USING_REVIEW_DAYS
} from './recurring-alerts.types';
import { signedDaysBetween } from './recurring-dates';
import { nextChargeDate } from './recurring-schedule';
import { RecurringSeriesRecord, SERIES_STATUSES } from './recurring-series.types';
import { CADENCES } from './recurring.types';
import { isToReview } from './recurring-totals';

export interface TimeAlert {
    readonly id: string;
    readonly seriesId: string;
    readonly kind: AlertKind;
    readonly occurredOn: string;
    readonly data: AlertData;
}

export interface TimeAlertInput {
    readonly series: RecurringSeriesRecord;
    readonly createdOn: string;
    readonly chargeCount: number;
}

function stillUsing(input: TimeAlertInput, today: string): TimeAlert[] {
    const { series } = input;
    const reviewable: boolean = isToReview(series, today) && input.chargeCount >= STILL_USING_MIN_CHARGES;
    if (!reviewable || signedDaysBetween(input.createdOn, today) < STILL_USING_REVIEW_DAYS) {
        return [];
    }
    return [
        {
            id: `${ALERT_KINDS.stillUsing}:${series.id}`,
            seriesId: series.id,
            kind: ALERT_KINDS.stillUsing,
            occurredOn: series.lastDate,
            data: { chargeCount: input.chargeCount, amountMinor: series.typicalAmountMinor }
        }
    ];
}

function renewal(input: TimeAlertInput, today: string): TimeAlert[] {
    const { series } = input;
    if (series.status !== SERIES_STATUSES.confirmed || series.cadence !== CADENCES.annual) {
        return [];
    }
    const date: string = nextChargeDate(series, today);
    const daysUntil: number = signedDaysBetween(today, date);
    if (daysUntil < 0 || daysUntil > RENEWAL_WINDOW_DAYS) {
        return [];
    }
    return [
        {
            id: `${ALERT_KINDS.renewal}:${series.id}`,
            seriesId: series.id,
            kind: ALERT_KINDS.renewal,
            occurredOn: date,
            data: { renewalDate: date, amountMinor: series.typicalAmountMinor, daysUntil }
        }
    ];
}

export function deriveTimeAlerts(inputs: readonly TimeAlertInput[], today: string): TimeAlert[] {
    return inputs.flatMap((input: TimeAlertInput): TimeAlert[] => [...stillUsing(input, today), ...renewal(input, today)]);
}
