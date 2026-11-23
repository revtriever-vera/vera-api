import { Insertable, Selectable } from 'kysely';
import { WhatsAppPendingActions } from '../../../core/database/generated/database.types';

export type PendingAction = Selectable<WhatsAppPendingActions>;
export type NewPendingAction = Insertable<WhatsAppPendingActions>;

export const PENDING_KINDS = {
    calendarCreate: 'calendar_create',
    reminderCreate: 'reminder_create',
    reminderDelete: 'reminder_delete'
} as const;

export type PendingKind = (typeof PENDING_KINDS)[keyof typeof PENDING_KINDS];

export const PENDING_RESOLUTIONS = { confirmed: 'confirmed', canceled: 'canceled', expired: 'expired' } as const;

export type PendingResolution = (typeof PENDING_RESOLUTIONS)[keyof typeof PENDING_RESOLUTIONS];

export type Tap = 'yes' | 'no';

export type GateState = 'available' | 'premium_required' | 'paused' | 'disabled';

export const CHAT_ROUTES = {
    unlinked: 'unlinked',
    unsupported: 'unsupported',
    optOut: 'opt_out',
    pixRefusal: 'pix_refusal',
    help: 'help',
    reminderCommand: 'reminder_cmd',
    premiumRequired: 'premium_required',
    paused: 'paused',
    noConsent: 'no_consent',
    ask: 'ask',
    button: 'button',
    typedConfirmation: 'typed_confirmation',
    disabled: 'disabled'
} as const;

export type ChatRouteName = (typeof CHAT_ROUTES)[keyof typeof CHAT_ROUTES];

export const PENDING_TTL_MINUTES: number = 30;
export const MINUTE_MS: number = 60_000;
export const COALESCE_WINDOW_MS: number = 5000;
export const HISTORY_LIMIT: number = 12;
export const ONE_DAY_SECONDS: number = 86_400;
export const ONE_MINUTE_SECONDS: number = 60;
export const LIMITED_NOTICE_SECONDS: number = 600;
export const ROOM_ESTIMATE_MICROS: number = 10_000;
export const TURN_ATTEMPTS: number = 3;
export const TURN_BACKOFF_MS: number = 5000;
export const MAX_REPLY_SENTENCES: number = 3;
