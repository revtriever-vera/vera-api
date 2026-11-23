import { Insertable, Selectable, Updateable } from 'kysely';
import { RecurringCharges, RecurringSeries, RecurringSuppressions } from '../../../core/database/generated/database.types';
import { Cadence, DayChange, ValueMode } from './recurring.types';

export type SeriesRow = Selectable<RecurringSeries>;
export type NewSeries = Insertable<RecurringSeries>;
export type SeriesPatch = Updateable<RecurringSeries>;
export type ChargeRow = Selectable<RecurringCharges>;
export type NewCharge = Insertable<RecurringCharges>;
export type SuppressionRow = Selectable<RecurringSuppressions>;

export const SERIES_STATUSES = {
    suggested: 'suggested',
    confirmed: 'confirmed',
    dismissed: 'dismissed',
    stopped: 'stopped'
} as const;

export type SeriesStatus = (typeof SERIES_STATUSES)[keyof typeof SERIES_STATUSES];

export const SERIES_KINDS = {
    subscription: 'subscription',
    bill: 'bill',
    other: 'other'
} as const;

export type SeriesKind = (typeof SERIES_KINDS)[keyof typeof SERIES_KINDS];

export const SERIES_ORIGINS = {
    detected: 'detected',
    manual: 'manual'
} as const;

export type SeriesOrigin = (typeof SERIES_ORIGINS)[keyof typeof SERIES_ORIGINS];

export const STOPPED_BY = {
    user: 'user',
    auto: 'auto'
} as const;

export type StoppedBy = (typeof STOPPED_BY)[keyof typeof STOPPED_BY];

export const CHARGE_ROLES = {
    charge: 'charge',
    duplicate: 'duplicate',
    trial: 'trial',
    excluded: 'excluded'
} as const;

export type ChargeRole = (typeof CHARGE_ROLES)[keyof typeof CHARGE_ROLES];

export const SNOOZE_DAYS: number = 30;
export const STOP_CADENCE_FACTOR: number = 1.5;
export const STOP_GRACE_DAYS: number = 5;
export const MAX_SERIES_PER_COMPANY: number = 500;
export const SERIES_NAME_MAX_LENGTH: number = 80;
export const SERIES_LIST_LIMIT: number = 1000;
export const DETECT_WINDOW_MS: number = 600_000;

export interface RecurringSeriesRecord {
    readonly id: string;
    readonly name: string;
    readonly merchantKey: string;
    readonly accountId: string;
    readonly cadence: Cadence;
    readonly valueMode: ValueMode;
    readonly kind: SeriesKind;
    readonly status: SeriesStatus;
    readonly origin: SeriesOrigin;
    readonly typicalAmountMinor: number;
    readonly minAmountMinor: number;
    readonly maxAmountMinor: number;
    readonly expectedDay: number | null;
    readonly dayChange: DayChange | null;
    readonly knownSubscription: boolean;
    readonly firstDate: string;
    readonly lastDate: string;
    readonly snoozedUntil: string | null;
    readonly confirmedAt: Date | null;
    readonly dismissedAt: Date | null;
    readonly stoppedAt: Date | null;
    readonly stoppedBy: StoppedBy | null;
    readonly createdAt: Date;
    readonly updatedAt: Date;
}

export interface SeriesFields {
    readonly name: string;
    readonly merchantKey: string;
    readonly accountId: string;
    readonly cadence: Cadence;
    readonly valueMode: ValueMode;
    readonly kind: SeriesKind;
    readonly status: SeriesStatus;
    readonly origin: SeriesOrigin;
    readonly typicalAmountMinor: number;
    readonly minAmountMinor: number;
    readonly maxAmountMinor: number;
    readonly expectedDay: number | null;
    readonly dayChange: DayChange | null;
    readonly knownSubscription: boolean;
    readonly firstDate: string;
    readonly lastDate: string;
    readonly confirmedAt: Date | null;
}

export interface DerivedFields {
    readonly typicalAmountMinor: number;
    readonly minAmountMinor: number;
    readonly maxAmountMinor: number;
    readonly dayChange: DayChange | null;
    readonly knownSubscription: boolean;
    readonly firstDate: string;
    readonly lastDate: string;
}

export interface DetectedFields extends DerivedFields {
    readonly cadence: Cadence;
    readonly valueMode: ValueMode;
    readonly expectedDay: number | null;
    readonly accountId: string;
    readonly kind: SeriesKind;
}

export interface SeriesEdits {
    readonly name?: string;
    readonly cadence?: Cadence;
    readonly expectedDay?: number | null;
    readonly valueMode?: ValueMode;
    readonly kind?: SeriesKind;
}

export interface StoredCharge {
    readonly id: string;
    readonly seriesId: string;
    readonly transactionId: string;
    readonly role: ChargeRole;
}

export interface DesiredCharge {
    readonly transactionId: string;
    readonly role: ChargeRole;
}

export interface ChargeDiff {
    readonly insert: readonly DesiredCharge[];
    readonly removeIds: readonly string[];
}

export interface StoredSeries {
    readonly id: string;
    readonly status: SeriesStatus;
    readonly merchantKey: string;
    readonly accountId: string;
    readonly cadence: Cadence;
    readonly typicalAmountMinor: number;
    readonly lastDate: string;
    readonly stoppedBy: StoppedBy | null;
    readonly chargeIds: ReadonlySet<string>;
}

export interface StoredSuppression {
    readonly merchantKey: string;
    readonly typicalAmountMinor: number;
}
