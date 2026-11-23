import { Selectable } from 'kysely';
import { AiConsents } from '../../../core/database/generated/database.types';

export const AI_CONSENT_SOURCES = {
    summaryCard: 'summary_card',
    privacySettings: 'privacy_settings',
    whatsappLink: 'whatsapp_link'
} as const;

export type AiConsentSource = (typeof AI_CONSENT_SOURCES)[keyof typeof AI_CONSENT_SOURCES];

export const AI_PAYLOAD_KINDS = {
    month: 'month',
    cuts: 'cuts',
    portfolio: 'portfolio'
} as const;

export type AiPayloadKind = (typeof AI_PAYLOAD_KINDS)[keyof typeof AI_PAYLOAD_KINDS];

export const AI_FEATURE = 'ai' as const;

export type AiConsent = Selectable<AiConsents>;

export interface GrantInput {
    readonly noticeVersion: number;
    readonly source: AiConsentSource;
    readonly userId: string | null;
}

export interface AiConsentView {
    readonly available: boolean;
    readonly granted: boolean;
    readonly needsConsent: boolean;
    readonly noticeVersion: number;
    readonly acceptedNoticeVersion: number | null;
    readonly grantedAt: string | null;
    readonly source: AiConsentSource | null;
    readonly canChange: boolean;
}

export interface AiConsentExport {
    readonly grantedAt: string;
    readonly noticeVersion: number;
    readonly source: string;
    readonly revokedAt: string | null;
}
