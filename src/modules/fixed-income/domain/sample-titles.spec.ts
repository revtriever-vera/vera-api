import { describe, expect, it } from 'vitest';
import { INDEXERS } from './curve/curve.types';
import { sampleTitleDrafts } from './sample-titles';
import { assertValidTerms } from './terms-validation';

describe('sampleTitleDrafts', () => {
    const today: string = '2026-10-11';

    it('cobre os três indexadores', () => {
        const indexers: string[] = sampleTitleDrafts(today, 'pt-BR').map((draft) => draft.indexer);

        expect(indexers).toEqual([INDEXERS.cdiPercent, INDEXERS.prefixed, INDEXERS.ipcaPlus]);
    });

    it('gera termos válidos para o hoje informado', () => {
        for (const draft of sampleTitleDrafts(today, 'pt-BR')) {
            expect(() => {
                assertValidTerms(draft, today);
            }).not.toThrow();
            expect(draft.appliedAt < today).toBe(true);
            expect(draft.maturityDate > today).toBe(true);
        }
    });

    it('nomeia os títulos no idioma pedido', () => {
        expect(sampleTitleDrafts(today, 'pt-BR').map((draft) => draft.name)).toEqual([
            'CDB Exemplo 110% CDI',
            'LCI Exemplo Pré 11,5%',
            'Debênture Exemplo IPCA+6%'
        ]);
        expect(sampleTitleDrafts(today, 'en').map((draft) => draft.name)).toEqual([
            'Sample CDB 110% CDI',
            'Sample LCI Fixed 11.5%',
            'Sample Debenture IPCA+6%'
        ]);
    });
});
