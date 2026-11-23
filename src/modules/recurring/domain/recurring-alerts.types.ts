import { Selectable } from 'kysely';
import { RecurringAlerts } from '../../../core/database/generated/database.types';
import { SeriesStatus, StoppedBy } from './recurring-series.types';
import { Cadence } from './recurring.types';

export type AlertRow = Selectable<RecurringAlerts>;

export const ALERT_KINDS = {
    priceIncrease: 'price_increase',
    duplicateCharge: 'duplicate_charge',
    duplicateAccount: 'duplicate_account',
    trialConverted: 'trial_converted',
    returned: 'returned',
    stillUsing: 'still_using',
    renewal: 'renewal'
} as const;

export type AlertKind = (typeof ALERT_KINDS)[keyof typeof ALERT_KINDS];

export const STORED_ALERT_KINDS: readonly AlertKind[] = [
    ALERT_KINDS.priceIncrease,
    ALERT_KINDS.duplicateCharge,
    ALERT_KINDS.duplicateAccount,
    ALERT_KINDS.trialConverted,
    ALERT_KINDS.returned
];

export const ALERT_RECENCY_DAYS: number = 90;
export const PRICE_RISE_ABSOLUTE_MINOR: number = 100;
export const PRICE_RISE_RELATIVE: number = 0.05;
export const PRICE_WINDOW: number = 3;
export const RETURN_GAP_DAYS: number = 60;
export const STILL_USING_REVIEW_DAYS: number = 30;
export const STILL_USING_MIN_CHARGES: number = 3;
export const RENEWAL_WINDOW_DAYS: number = 30;
export const CALENDAR_DEFAULT_DAYS: number = 60;
export const CALENDAR_MAX_DAYS: number = 90;
export const ALERT_LIST_LIMIT: number = 2000;

export type AlertData = Readonly<Record<string, string | number>>;

export interface DesiredAlert {
    readonly seriesId: string;
    readonly kind: AlertKind;
    readonly fingerprint: string;
    readonly occurredOn: string;
    readonly data: AlertData;
}

export interface AlertRecord extends DesiredAlert {
    readonly id: string;
    readonly seenAt: Date | null;
}

export interface AlertCharge {
    readonly id: string;
    readonly date: string;
    readonly amountMinor: number;
    readonly accountId: string;
    readonly merchantKey: string;
}

export interface AlertSeries {
    readonly id: string;
    readonly merchantKey: string;
    readonly accountId: string;
    readonly cadence: Cadence;
    readonly status: SeriesStatus;
    readonly stoppedBy: StoppedBy | null;
    readonly stoppedOn: string | null;
    readonly expectedDay: number | null;
    readonly typicalAmountMinor: number;
    readonly chargeIds: readonly string[];
    readonly duplicateIds: readonly string[];
    readonly trialIds: readonly string[];
}

export interface AlertDiff {
    readonly insert: readonly DesiredAlert[];
    readonly update: readonly { readonly id: string; readonly alert: DesiredAlert }[];
    readonly removeIds: readonly string[];
}

export interface SeriesCharges {
    readonly chargeIds: string[];
    readonly duplicateIds: string[];
    readonly trialIds: string[];
}
