import { Insertable, Selectable } from 'kysely';
import { WhatsAppLinkCodes, WhatsAppLinks } from '../../../core/database/generated/database.types';
import { AppLocale } from '../../../shared/i18n/locale';

export type WhatsAppLink = Selectable<WhatsAppLinks>;
export type NewWhatsAppLink = Insertable<WhatsAppLinks>;
export type WhatsAppLinkCode = Selectable<WhatsAppLinkCodes>;
export type NewWhatsAppLinkCode = Insertable<WhatsAppLinkCodes>;

export const LINK_STATUSES = {
    active: 'active',
    unlinked: 'unlinked',
    suspended: 'suspended'
} as const;

export type LinkStatus = (typeof LINK_STATUSES)[keyof typeof LINK_STATUSES];

export const LIVE_STATUSES: readonly LinkStatus[] = [LINK_STATUSES.active, LINK_STATUSES.suspended];

export const UNLINK_REASONS = {
    userApp: 'user_app',
    userChat: 'user_chat',
    optOut: 'opt_out',
    premiumEnded: 'premium_ended',
    memberRemoved: 'member_removed',
    accountDeleted: 'account_deleted',
    stale: 'stale'
} as const;

export type UnlinkReason = (typeof UNLINK_REASONS)[keyof typeof UNLINK_REASONS];

export const OPT_IN_SOURCES = { userMessage: 'user_message' } as const;

export type ResolvedSender = {
    readonly linkId: string;
    readonly companyId: string;
    readonly userId: string;
    readonly locale: AppLocale;
};

export type StaleLinkRef = { readonly id: string; readonly companyId: string };
export type StatusCount = { readonly status: string; readonly total: number };

export type ViewStatus = 'none' | 'pending' | 'active' | 'suspended';

export const CODE_REQUESTS_PER_USER_PER_HOUR: number = 5;
export const CODE_REQUESTS_PER_COMPANY_PER_DAY: number = 20;
export const REJECTED_REPLIES_PER_PHONE_PER_HOUR: number = 5;
export const ONE_HOUR_SECONDS: number = 3600;
export const ONE_DAY_SECONDS: number = 86_400;
export const STALE_BATCH: number = 200;
export const ERASE_BATCH: number = 200;
