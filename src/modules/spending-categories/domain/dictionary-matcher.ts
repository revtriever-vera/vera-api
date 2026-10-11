import merchantDictionaryJson from '../data/merchant-dictionary.json';
import { DictionaryEntry, merchantDictionarySchema } from '../validation/data.schemas';
import { matchesDirection } from './direction';

function byLongestPattern(a: DictionaryEntry, b: DictionaryEntry): number {
    return b.pattern.length - a.pattern.length || a.pattern.localeCompare(b.pattern);
}

export function buildDictionaryIndex(entries: readonly DictionaryEntry[]): readonly DictionaryEntry[] {
    return [...entries].sort(byLongestPattern);
}

function entryMatches(entry: DictionaryEntry, boundedDescription: string, normalizedDescription: string): boolean {
    if (entry.match === 'prefix') {
        return normalizedDescription.startsWith(entry.pattern);
    }
    return boundedDescription.includes(` ${entry.pattern} `);
}

export function matchDictionary(
    index: readonly DictionaryEntry[],
    normalizedDescription: string,
    amountMinor: number
): DictionaryEntry | null {
    const bounded: string = ` ${normalizedDescription} `;
    return (
        index.find(
            (entry: DictionaryEntry): boolean =>
                matchesDirection(entry.direction, amountMinor) && entryMatches(entry, bounded, normalizedDescription)
        ) ?? null
    );
}

export const MERCHANT_DICTIONARY: readonly DictionaryEntry[] = buildDictionaryIndex(merchantDictionarySchema.parse(merchantDictionaryJson));
