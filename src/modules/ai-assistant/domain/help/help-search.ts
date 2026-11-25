import { AppLocale } from '../../../../shared/i18n/locale';
import { HELP_MAX_RESULTS, HelpEntry, HelpText } from './help.types';

const MIN_SCORE: number = 2;
const MIN_STEM_LENGTH: number = 4;
const MIN_WORD_LENGTH: number = 2;
const KEYWORD_POINTS: number = 3;
const SYNONYM_POINTS: number = 2;
const TITLE_POINTS: number = 2;
const BODY_POINTS: number = 1;
const PHRASE_POINTS: number = 4;

const STOPWORDS: ReadonlySet<string> = new Set([
    'a',
    'o',
    'as',
    'os',
    'um',
    'uma',
    'de',
    'do',
    'da',
    'dos',
    'das',
    'no',
    'na',
    'nos',
    'nas',
    'em',
    'e',
    'ou',
    'para',
    'por',
    'com',
    'que',
    'qual',
    'quais',
    'como',
    'onde',
    'eu',
    'meu',
    'minha',
    'se',
    'ao',
    'vera',
    'the',
    'an',
    'of',
    'in',
    'on',
    'to',
    'for',
    'and',
    'or',
    'how',
    'do',
    'does',
    'where',
    'what',
    'is',
    'are',
    'my',
    'i',
    'can',
    'me',
    'it',
    'at',
    'with'
]);

export function normalizedWords(text: string): readonly string[] {
    const plain: string = text
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase();
    return plain.split(/[^\p{L}\p{N}]+/u).filter((word: string): boolean => word.length >= MIN_WORD_LENGTH && !STOPWORDS.has(word));
}

function sameWord(left: string, right: string): boolean {
    if (left === right) {
        return true;
    }
    const shortest: number = Math.min(left.length, right.length);
    return shortest >= MIN_STEM_LENGTH && (left.startsWith(right) || right.startsWith(left));
}

function containsWord(words: readonly string[], target: string): boolean {
    return words.some((word: string): boolean => sameWord(word, target));
}

function matchCount(words: readonly string[], query: readonly string[]): number {
    return query.filter((word: string): boolean => containsWord(words, word)).length;
}

function phraseScore(phrases: readonly string[], query: readonly string[], points: number): number {
    let score: number = 0;
    const joined: string = ` ${query.join(' ')} `;
    for (const phrase of phrases) {
        const words: readonly string[] = normalizedWords(phrase);
        score += matchCount(words, query) * points;
        score += words.length > 1 && joined.includes(` ${words.join(' ')} `) ? PHRASE_POINTS : 0;
    }
    return score;
}

function textScore(text: string, query: readonly string[], points: number): number {
    const words: readonly string[] = normalizedWords(text);
    return matchCount(words, query) * points;
}

export function scoreOf(entry: HelpEntry, query: readonly string[], locale: AppLocale): number {
    const text: HelpText = entry.texts[locale];
    return (
        phraseScore(entry.keywords, query, KEYWORD_POINTS) +
        phraseScore(entry.synonyms, query, SYNONYM_POINTS) +
        textScore(text.title, query, TITLE_POINTS) +
        textScore(text.body, query, BODY_POINTS)
    );
}

interface Scored {
    readonly entry: HelpEntry;
    readonly score: number;
}

export function searchHelp(
    catalog: readonly HelpEntry[],
    rawQuery: string,
    locale: AppLocale,
    limit: number = HELP_MAX_RESULTS
): readonly HelpEntry[] {
    const query: readonly string[] = normalizedWords(rawQuery);
    if (query.length === 0) {
        return [];
    }
    return catalog
        .map((entry: HelpEntry): Scored => ({ entry, score: scoreOf(entry, query, locale) }))
        .filter((scored: Scored): boolean => scored.score >= MIN_SCORE)
        .sort((left: Scored, right: Scored): number => right.score - left.score || left.entry.id.localeCompare(right.entry.id))
        .slice(0, limit)
        .map((scored: Scored): HelpEntry => scored.entry);
}
