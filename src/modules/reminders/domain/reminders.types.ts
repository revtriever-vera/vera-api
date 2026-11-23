import { Selectable } from 'kysely';
import { ReminderOccurrences, Reminders } from '../../../core/database/generated/database.types';

export type Reminder = Selectable<Reminders>;
export type ReminderOccurrence = Selectable<ReminderOccurrences>;

export const REMINDER_KINDS = { once: 'once', monthly: 'monthly' } as const;
export type ReminderKind = (typeof REMINDER_KINDS)[keyof typeof REMINDER_KINDS];

export const REMINDER_STATUSES = { active: 'active', done: 'done', canceled: 'canceled' } as const;
export type ReminderStatus = (typeof REMINDER_STATUSES)[keyof typeof REMINDER_STATUSES];

export const CANCEL_REASONS = {
    user: 'user',
    unlinked: 'unlinked',
    premiumEnded: 'premium_ended',
    memberRemoved: 'member_removed',
    accountDeleted: 'account_deleted'
} as const;
export type CancelReason = (typeof CANCEL_REASONS)[keyof typeof CANCEL_REASONS];

export const OCCURRENCE_KINDS = { regular: 'regular', snooze: 'snooze' } as const;
export type OccurrenceKind = (typeof OCCURRENCE_KINDS)[keyof typeof OCCURRENCE_KINDS];

export const OCCURRENCE_STATUSES = {
    scheduled: 'scheduled',
    sending: 'sending',
    sent: 'sent',
    done: 'done',
    missed: 'missed',
    unreached: 'unreached',
    canceled: 'canceled'
} as const;
export type OccurrenceStatus = (typeof OCCURRENCE_STATUSES)[keyof typeof OCCURRENCE_STATUSES];

export const CHANNELS = { text: 'text', template: 'template' } as const;
export type DeliveryChannel = (typeof CHANNELS)[keyof typeof CHANNELS];

export const MISS_REASONS = {
    stale: 'stale',
    paused: 'paused',
    premium: 'premium',
    templateLimit: 'template_limit'
} as const;
export type MissReason = (typeof MISS_REASONS)[keyof typeof MISS_REASONS];

export const UNREACHED_REASONS = {
    noLink: 'no_link',
    templateUnavailable: 'template_unavailable',
    providerDisabled: 'provider_disabled',
    sendFailed: 'send_failed'
} as const;
export type UnreachedReason = (typeof UNREACHED_REASONS)[keyof typeof UNREACHED_REASONS];

export type ButtonAction = 'done' | 'snooze1h' | 'tomorrow';

export type NewReminderInput = {
    readonly userId: string;
    readonly linkId: string;
    readonly text: string;
    readonly kind: ReminderKind;
    readonly onceAt: Date | null;
    readonly dayOfMonth: number | null;
    readonly timeOfDay: string;
    readonly timezone: string;
};

export type CanceledOccurrence = { readonly id: string; readonly reminderId: string; readonly occurrenceAt: Date };

export type CancelResult = { readonly reminders: number; readonly occurrences: readonly CanceledOccurrence[] };

export type CancelScope = { readonly linkId: string } | { readonly userId: string } | { readonly all: true };

export type DueOccurrenceRef = { readonly id: string; readonly companyId: string; readonly occurrenceAt: Date };

export type FirePayload = { readonly occurrenceId: string };

export const TEXT_LIMIT: number = 120;
export const DEFAULT_TIME_OF_DAY: string = '09:00';
export const STALE_AFTER_MS: number = 6 * 60 * 60 * 1000;
export const SNOOZE_MS: number = 60 * 60 * 1000;
export const SWEEP_GRACE_MS: number = 2 * 60 * 1000;
export const SWEEP_BATCH: number = 200;
export const EXPORT_PAGE: number = 200;
export const FIRE_ATTEMPTS: number = 3;
export const FIRE_BACKOFF_MS: number = 5000;
export const MAX_LIST_POSITION: number = 99;

export function reminderButtonIdOf(action: ButtonAction, reminderId: string): string {
    return `rem:${action}:${reminderId}`;
}

export function fireJobIdOf(reminderId: string, occurrenceAt: Date): string {
    return `reminder-${reminderId}-${String(occurrenceAt.getTime())}`;
}
