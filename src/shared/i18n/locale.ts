export const APP_LOCALES: readonly ['pt-BR', 'en'] = ['pt-BR', 'en'];

export type AppLocale = (typeof APP_LOCALES)[number];

export const DEFAULT_LOCALE: AppLocale = 'pt-BR';

const DEFAULT_QUALITY: number = 1;

interface WeightedTag {
    readonly tag: string;
    readonly q: number;
}

function qualityOf(params: readonly string[]): number {
    for (const param of params) {
        if (param.startsWith('q=')) {
            const value: number = Number(param.slice(2));
            return Number.isFinite(value) ? value : DEFAULT_QUALITY;
        }
    }
    return DEFAULT_QUALITY;
}

function parseAcceptLanguage(header: string): WeightedTag[] {
    const weighted: WeightedTag[] = [];
    for (const rawEntry of header.split(',')) {
        const entry: string = rawEntry.trim();
        if (entry.length === 0) {
            continue;
        }
        const segments: string[] = entry.split(';').map((part: string) => part.trim());
        const tag: string = (segments[0] ?? '').toLowerCase();
        if (tag.length === 0 || tag === '*') {
            continue;
        }
        weighted.push({ tag, q: qualityOf(segments.slice(1)) });
    }
    return weighted.sort((a: WeightedTag, b: WeightedTag) => b.q - a.q);
}

function localeFromTag(tag: string): AppLocale | null {
    const primary: string = tag.split('-')[0] ?? tag;
    if (primary === 'pt') {
        return 'pt-BR';
    }
    if (primary === 'en') {
        return 'en';
    }
    return null;
}

export function resolveLocale(acceptLanguage: string | undefined | null): AppLocale {
    if (acceptLanguage === undefined || acceptLanguage === null || acceptLanguage.length === 0) {
        return DEFAULT_LOCALE;
    }
    for (const weighted of parseAcceptLanguage(acceptLanguage)) {
        const locale: AppLocale | null = localeFromTag(weighted.tag);
        if (locale !== null) {
            return locale;
        }
    }
    return DEFAULT_LOCALE;
}

export function closestAppLocale(tag: string): AppLocale {
    return localeFromTag(tag.trim().toLowerCase().replace('_', '-')) ?? 'en';
}
