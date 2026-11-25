import { AppLocale } from '../../../../shared/i18n/locale';

export type HelpRole = 'viewer' | 'editor' | 'owner';

export type HelpPlans = 'all' | 'premium';

export interface HelpText {
    readonly title: string;
    readonly body: string;
    readonly steps?: readonly string[];
}

export interface HelpScreen {
    readonly path: string;
    readonly label: Readonly<Record<AppLocale, string>>;
}

export interface HelpEntry {
    readonly id: string;
    readonly texts: Readonly<Record<AppLocale, HelpText>>;
    readonly screen?: HelpScreen;
    readonly plans: HelpPlans;
    readonly minRole?: HelpRole;
    readonly keywords: readonly string[];
    readonly synonyms: readonly string[];
}

export interface HelpEntrySpec {
    readonly id: string;
    readonly pt: HelpText;
    readonly en: HelpText;
    readonly screen?: { readonly path: string; readonly pt: string; readonly en: string };
    readonly plans?: HelpPlans;
    readonly minRole?: HelpRole;
    readonly keywords: readonly string[];
    readonly synonyms?: readonly string[];
}

export const HELP_MAX_BODY_CHARS: number = 600;
export const HELP_MAX_RESULTS: number = 3;
