import { Insertable, Selectable } from 'kysely';
import { PaidUsageEntries, PaidUsageNotices } from '../database/generated/database.types';

export const USAGE_FEATURES = ['ai', 'whatsapp'] as const;
export type UsageFeature = (typeof USAGE_FEATURES)[number];

export const USAGE_OUTCOMES = ['answered', 'unanswered'] as const;
export type UsageOutcome = (typeof USAGE_OUTCOMES)[number];

export const SEND_CATEGORIES = ['authentication', 'utility', 'marketing'] as const;
export type SendCategory = (typeof SEND_CATEGORIES)[number];

export const NOTICE_KINDS = { warning: 'warning', paused: 'paused' } as const;
export type NoticeKind = (typeof NOTICE_KINDS)[keyof typeof NOTICE_KINDS];

export const USAGE_STATES = { ok: 'ok', warning: 'warning', paused: 'paused' } as const;
export type UsageStateKey = (typeof USAGE_STATES)[keyof typeof USAGE_STATES];

export const BPS_FULL: number = 10_000;
export const MICROS_PER_UNIT: number = 1_000_000;
export const EXPORT_MONTHS_BACK: number = 12;
export const RETENTION_MONTHS: number = 13;

export type PaidUsageEntry = Selectable<PaidUsageEntries>;
export type NewPaidUsageEntry = Insertable<PaidUsageEntries>;
export type PaidUsageNotice = Selectable<PaidUsageNotices>;

export interface UsageDetail {
    readonly model?: string;
    readonly inputTokens?: number;
    readonly outputTokens?: number;
    readonly category?: SendCategory;
}

export interface UsageState {
    readonly period: string;
    readonly capMicros: number | null;
    readonly usedMicros: number;
    readonly usedBps: number;
    readonly byFeature: Readonly<Record<UsageFeature, number>>;
    readonly state: UsageStateKey;
    readonly resetsAt: string;
}

export type FeatureMicros = Readonly<Record<UsageFeature, number>>;

export interface UsdRate {
    readonly rate: string;
    readonly date: string;
    readonly source: 'ptax' | 'fallback';
}

export interface AssertRoomInput {
    readonly feature: UsageFeature;
    readonly task: string;
    readonly estimateMicros: number;
}

export interface RecordUsageInput {
    readonly feature: UsageFeature;
    readonly task: string;
    readonly referenceId: string;
    readonly costMicros: number;
    readonly providerCostMicros?: number;
    readonly usdBrlRate?: string;
    readonly estimateMicros?: number;
    readonly outcome: UsageOutcome;
    readonly detail?: UsageDetail;
}

export interface SendRecordInput {
    readonly kind: 'whatsapp_template';
    readonly category: SendCategory;
    readonly task: string;
    readonly referenceId: string;
}

export interface UsageThresholdPayload {
    readonly period: string;
    readonly kind: NoticeKind;
    readonly usedBps: number;
}

export interface PeriodFeatureTotal {
    readonly period: string;
    readonly feature: UsageFeature;
    readonly costMicros: number;
    readonly entries: number;
}

export interface CompanyUsage {
    readonly companyId: string;
    readonly usedMicros: number;
}
