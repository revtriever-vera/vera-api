import { describe, expect, it } from 'vitest';
import pluggyCategoryMapJson from '../data/pluggy-category-map.json';
import { PluggyCategoryEntry, pluggyCategoryMapSchema } from '../validation/data.schemas';
import { isSystemCategoryKey } from './system-categories';

const ENTRIES: PluggyCategoryEntry[] = pluggyCategoryMapSchema.parse(pluggyCategoryMapJson);

describe('pluggy-category-map.json', () => {
    it('passa pelo schema com ids de oito dígitos', () => {
        expect(pluggyCategoryMapSchema.safeParse(pluggyCategoryMapJson).success).toBe(true);
    });

    it('todo category é uma systemKey válida', () => {
        expect(ENTRIES.filter((entry: PluggyCategoryEntry) => !isSystemCategoryKey(entry.category))).toEqual([]);
    });

    it('não repete id e fica ordenado', () => {
        const ids: string[] = ENTRIES.map((entry: PluggyCategoryEntry) => entry.pluggyId);

        expect(new Set(ids).size).toBe(ids.length);
        expect(ids).toEqual([...ids].sort());
    });

    it('deixa de fora empréstimos, transferências e transferências para terceiros', () => {
        const topLevel: Set<string> = new Set(ENTRIES.map((entry: PluggyCategoryEntry) => entry.pluggyId.slice(0, 2)));

        expect(topLevel.has('02')).toBe(false);
        expect(topLevel.has('05')).toBe(false);
        expect(topLevel.has('06')).toBe(false);
    });

    it('mapeia os 20 ids de nível 1 da tabela do card', () => {
        expect(ENTRIES).toHaveLength(20);
    });
});
