import { JsonObject } from '../../../../core/llm/llm.types';
import { AppLocale } from '../../../../shared/i18n/locale';
import { searchHelp } from './help-search';
import { HELP_MAX_RESULTS, HelpEntry, HelpRole, HelpText } from './help.types';

const ROLE_LABELS: Readonly<Record<AppLocale, Readonly<Record<HelpRole, string>>>> = {
    'pt-BR': { owner: 'Dono', editor: 'Editor', viewer: 'Leitura' },
    en: { owner: 'Owner', editor: 'Editor', viewer: 'Viewer' }
};

const SCREEN_CANDIDATES: number = 8;
const NO_RESULT: string = 'no_result';

export type RoleCheck = (minRole: HelpRole | undefined) => boolean;

function entryPayload(entry: HelpEntry, locale: AppLocale): JsonObject {
    const text: HelpText = entry.texts[locale];
    return {
        titulo: text.title,
        body: text.body,
        ...(text.steps === undefined ? {} : { steps: [...text.steps] }),
        ...(entry.screen === undefined ? {} : { link: entry.screen.path }),
        plano: entry.plans === 'premium' ? 'premium' : 'todos'
    };
}

export function helpSearchPayload(catalog: readonly HelpEntry[], query: string, locale: AppLocale): JsonObject {
    const found: readonly HelpEntry[] = searchHelp(catalog, query, locale, HELP_MAX_RESULTS);
    if (found.length === 0) {
        return { status: NO_RESULT, entradas: [] };
    }
    return { entradas: found.map((entry: HelpEntry): JsonObject => entryPayload(entry, locale)) };
}

function distinctScreens(entries: readonly HelpEntry[]): readonly HelpEntry[] {
    const seen: Set<string> = new Set();
    const distinct: HelpEntry[] = [];
    for (const entry of entries) {
        if (entry.screen !== undefined && !seen.has(entry.screen.path)) {
            seen.add(entry.screen.path);
            distinct.push(entry);
        }
    }
    return distinct.slice(0, HELP_MAX_RESULTS);
}

function roleOf(entry: HelpEntry, locale: AppLocale): string {
    return ROLE_LABELS[locale][entry.minRole ?? 'viewer'];
}

function screenPayload(entry: HelpEntry, locale: AppLocale, withLink: boolean): JsonObject {
    const label: string = entry.screen?.label[locale] ?? entry.texts[locale].title;
    const base: JsonObject = { tela: label, papel: roleOf(entry, locale) };
    return withLink && entry.screen !== undefined ? { ...base, link: entry.screen.path } : base;
}

export function whereIsPayload(catalog: readonly HelpEntry[], topic: string, locale: AppLocale, canOpen: RoleCheck): JsonObject {
    const withScreen: readonly HelpEntry[] = catalog.filter((entry: HelpEntry): boolean => entry.screen !== undefined);
    const screens: readonly HelpEntry[] = distinctScreens(searchHelp(withScreen, topic, locale, SCREEN_CANDIDATES));
    if (screens.length === 0) {
        return { status: NO_RESULT, telas: [], semAcesso: [] };
    }
    return {
        telas: screens
            .filter((entry: HelpEntry): boolean => canOpen(entry.minRole))
            .map((entry: HelpEntry): JsonObject => screenPayload(entry, locale, true)),
        semAcesso: screens
            .filter((entry: HelpEntry): boolean => !canOpen(entry.minRole))
            .map((entry: HelpEntry): JsonObject => screenPayload(entry, locale, false))
    };
}
