import { describe, expect, it } from 'vitest';
import { INDEXERS } from './curve/curve.types';
import { sampleTitleDrafts } from './sample-titles';
import { assertValidTerms } from './terms-validation';

describe('sampleTitleDrafts', () => {
    const today: string = '2026-10-11';

    it('cobre os três indexadores', () => {
        const indexers: string[] = sampleTitleDrafts(today).map((draft) => draft.indexer);

        expect(indexers).toEqual([INDEXERS.cdiPercent, INDEXERS.prefixed, INDEXERS.ipcaPlus]);
    });

    it('gera termos válidos para o hoje informado', () => {
        for (const draft of sampleTitleDrafts(today)) {
            expect(() => {
                assertValidTerms(draft, today);
            }).not.toThrow();
            expect(draft.appliedAt < today).toBe(true);
            expect(draft.maturityDate > today).toBe(true);
        }
    });
});
