import { describe, expect, it } from 'vitest';
import merchantDictionaryJson from '../data/merchant-dictionary.json';
import { normalizeDescription } from '../services/description-normalizer.service';
import { DictionaryEntry, merchantDictionarySchema } from '../validation/data.schemas';
import { SYSTEM_CATEGORY_KEYS } from './categories.types';
import { isSystemCategoryKey } from './system-categories';

const ENTRIES: DictionaryEntry[] = merchantDictionarySchema.parse(merchantDictionaryJson);
const INCOMING_TARGETS: ReadonlySet<string> = new Set<string>([
    SYSTEM_CATEGORY_KEYS.income,
    SYSTEM_CATEGORY_KEYS.otherIncome,
    SYSTEM_CATEGORY_KEYS.investments
]);

describe('merchant-dictionary.json', () => {
    it('passa pelo schema e tem pelo menos 120 entradas', () => {
        expect(merchantDictionarySchema.safeParse(merchantDictionaryJson).success).toBe(true);
        expect(ENTRIES.length).toBeGreaterThanOrEqual(120);
    });

    it('todo category é uma systemKey válida', () => {
        expect(ENTRIES.filter((entry: DictionaryEntry) => !isSystemCategoryKey(entry.category))).toEqual([]);
    });

    it('todo pattern já está normalizado', () => {
        expect(ENTRIES.filter((entry: DictionaryEntry) => normalizeDescription(entry.pattern) !== entry.pattern)).toEqual([]);
    });

    it('não repete pattern e fica ordenado por pattern', () => {
        const patterns: string[] = ENTRIES.map((entry: DictionaryEntry) => entry.pattern);

        expect(new Set(patterns).size).toBe(patterns.length);
        expect(patterns).toEqual([...patterns].sort());
    });

    it('entradas in só apontam para income, other_income ou investments', () => {
        const offenders: DictionaryEntry[] = ENTRIES.filter(
            (entry: DictionaryEntry) => entry.direction === 'in' && !INCOMING_TARGETS.has(entry.category)
        );

        expect(offenders).toEqual([]);
    });

    it('categorias de renda só têm entradas in', () => {
        const offenders: DictionaryEntry[] = ENTRIES.filter(
            (entry: DictionaryEntry) =>
                (entry.category === SYSTEM_CATEGORY_KEYS.income || entry.category === SYSTEM_CATEGORY_KEYS.otherIncome) &&
                entry.direction !== 'in'
        );

        expect(offenders).toEqual([]);
    });

    it('cobre as famílias pedidas pelo card', () => {
        const patterns: Set<string> = new Set(ENTRIES.map((entry: DictionaryEntry) => entry.pattern));

        for (const expected of ['IFOOD', 'RAPPI', 'ZE DELIVERY', 'UBER', '99APP', '99 POP', 'SHELL', 'IPIRANGA', 'BR MANIA', 'SEM PARAR']) {
            expect(patterns.has(expected)).toBe(true);
        }
        for (const expected of [
            'PAO DE ACUCAR',
            'CARREFOUR',
            'ASSAI',
            'ATACADAO',
            'EXTRA',
            'ZAFFARI',
            'DIA',
            'NETFLIX',
            'SPOTIFY',
            'MAX'
        ]) {
            expect(patterns.has(expected)).toBe(true);
        }
        for (const expected of ['DROGASIL', 'SMART FIT', 'UNIMED', 'CINEMARK', 'STEAM', 'ENEL', 'SABESP', 'VIVO', 'APLICACAO', 'RESGATE']) {
            expect(patterns.has(expected)).toBe(true);
        }
    });
});
