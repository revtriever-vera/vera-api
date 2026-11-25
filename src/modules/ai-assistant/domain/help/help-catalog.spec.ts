import { describe, expect, it } from 'vitest';
import { APP_LOCALES, AppLocale } from '../../../../shared/i18n/locale';
import { HELP_CATALOG, HELP_ROUTES } from './help-catalog';
import { HELP_MAX_BODY_CHARS, HelpEntry, HelpText } from './help.types';

const ROUTE: RegExp = /^\/[a-z0-9]+(?:[-/][a-z0-9]+)*$|^\/$/;
const MAX_TITLE_CHARS: number = 60;
const MAX_STEP_CHARS: number = 120;
const FORBIDDEN: Readonly<Record<AppLocale, RegExp>> = {
    'pt-BR': /(?<![\p{L}\p{N}_])(?:IA|inteligente|inteligência|jornada|assistente|copiloto)(?![\p{L}\p{N}_])|!/iu,
    en: /(?<![\p{L}\p{N}_])(?:AI|smart|intelligent|journey|assistant|copilot)(?![\p{L}\p{N}_])|!/iu
};

interface Case {
    readonly entry: HelpEntry;
    readonly locale: AppLocale;
    readonly text: HelpText;
}

const CASES: readonly Case[] = HELP_CATALOG.flatMap((entry: HelpEntry): Case[] =>
    APP_LOCALES.map((locale: AppLocale): Case => ({ entry, locale, text: entry.texts[locale] }))
);

function textsOf(item: Case): readonly string[] {
    return [item.text.title, item.text.body, ...(item.text.steps ?? []), item.entry.screen?.label[item.locale] ?? ''];
}

describe('HELP_CATALOG', () => {
    it('cobre a primeira leva de assuntos', () => {
        const ids: ReadonlySet<string> = new Set(HELP_CATALOG.map((entry: HelpEntry): string => entry.id));
        for (const id of [
            'portfolio-overview',
            'portfolio-assets',
            'portfolio-targets',
            'portfolio-contribution',
            'portfolio-goals',
            'spending-summary',
            'spending-transactions',
            'spending-recurring',
            'spending-cuts',
            'savings-goal',
            'categories-and-rules',
            'import-statement',
            'connect-bank',
            'fixed-income-maturities',
            'settings',
            'settings-plan',
            'settings-integrations',
            'settings-people',
            'settings-whatsapp',
            'settings-calendar',
            'settings-preferences',
            'settings-privacy',
            'export-account',
            'delete-account',
            'plan-free',
            'plan-premium',
            'premium-quota',
            'summaries',
            'send-permission',
            'ask-vera',
            'self-hosting',
            'vera-limits'
        ]) {
            expect(ids.has(id), id).toBe(true);
        }
    });

    it('tem id único', () => {
        const ids: string[] = HELP_CATALOG.map((entry: HelpEntry): string => entry.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('tem rota bem formada, presente em HELP_ROUTES, e rótulo nos dois idiomas', () => {
        for (const { entry, locale } of CASES) {
            if (entry.screen === undefined) {
                continue;
            }
            expect(entry.screen.path, entry.id).toMatch(ROUTE);
            expect(HELP_ROUTES.has(entry.screen.path), entry.id).toBe(true);
            expect(entry.screen.label[locale].length, `${entry.id} ${locale}`).toBeGreaterThan(0);
        }
        expect(HELP_ROUTES.size).toBeGreaterThan(0);
    });

    it('tem todo texto nos dois idiomas, dentro do tamanho máximo', () => {
        for (const { entry, locale, text } of CASES) {
            expect(text.title.length, `${entry.id} ${locale} title`).toBeGreaterThan(0);
            expect(text.title.length, `${entry.id} ${locale} title`).toBeLessThanOrEqual(MAX_TITLE_CHARS);
            expect(text.body.length, `${entry.id} ${locale} body`).toBeGreaterThan(0);
            expect(text.body.length, `${entry.id} ${locale} body`).toBeLessThanOrEqual(HELP_MAX_BODY_CHARS);
            expect(
                Math.max(0, ...(text.steps ?? []).map((step: string): number => step.length)),
                `${entry.id} ${locale} step`
            ).toBeLessThanOrEqual(MAX_STEP_CHARS);
        }
    });

    it('tem os mesmos passos nos dois idiomas', () => {
        for (const entry of HELP_CATALOG) {
            expect(entry.texts['pt-BR'].steps?.length, entry.id).toBe(entry.texts.en.steps?.length);
        }
    });

    it('não usa termo proibido do tom de voz nem exclamação', () => {
        const offenders: string[] = CASES.flatMap((item: Case): string[] =>
            textsOf(item)
                .filter((text: string): boolean => FORBIDDEN[item.locale].test(text))
                .map((text: string): string => `${item.entry.id} ${item.locale}: ${text}`)
        );
        expect(offenders).toEqual([]);
    });

    it('tem palavras-chave em cada entrada', () => {
        for (const entry of HELP_CATALOG) {
            expect(entry.keywords.length, entry.id).toBeGreaterThan(0);
        }
    });
});
