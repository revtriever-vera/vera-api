import { Selectable } from 'kysely';
import { NoticePreferences, NoticeSends } from '../../../core/database/generated/database.types';

export type NoticePreference = Selectable<NoticePreferences>;
export type NoticeSend = Selectable<NoticeSends>;

export interface NoticeTypeDefinition {
    readonly type: string;
    readonly template: string;
}

export interface NoticeRequest {
    readonly type: string;
    readonly key: string;
    readonly props: Readonly<Record<string, string>>;
    readonly userId?: string;
}

export interface DigestEntry {
    readonly type: string;
    readonly key: string;
    readonly data: Readonly<Record<string, string>>;
}

export interface DigestRequest {
    readonly entries: readonly DigestEntry[];
    readonly props: Readonly<Record<string, string>>;
}

export const DIGEST_ENTRIES_PROP: string = 'entries';
export const DIGEST_UNSUBSCRIBE_PROP: string = 'unsubscribeUrls';

export interface NoticeOutcome {
    readonly sent: number;
    readonly skipped: number;
}

export interface NoticeSetting {
    readonly type: string;
    readonly enabled: boolean;
}

export const EXPORT_PAGE: number = 500;
