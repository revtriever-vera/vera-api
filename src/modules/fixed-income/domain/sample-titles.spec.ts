import { describe, expect, it } from 'vitest';
import { addDays } from './curve/business-days';
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
            'CDB Exemplo IPCA+6%'
        ]);
        expect(sampleTitleDrafts(today, 'en').map((draft) => draft.name)).toEqual([
            'Sample CDB 110% CDI',
            'Sample LCI Fixed 11.5%',
            'Sample CDB IPCA+6%'
        ]);
    });

    it('dá a cada título de exemplo um emissor do tipo certo', () => {
        const issuers: Array<string | null> = sampleTitleDrafts(today, 'pt-BR').map((draft) => draft.issuerId);

        expect(issuers).toEqual(['banco-sofisa', 'btg-pactual', 'banco-pan']);
    });

    it('reproduz os alertas da Visão geral: vencimento em menos de 60 dias e conglomerado acima do limite do FGC', () => {
        const drafts = sampleTitleDrafts(today, 'pt-BR');
        const sofisa = drafts.find((draft) => draft.issuerId === 'banco-sofisa');
        const btgGroup: number = drafts
            .filter((draft) => draft.issuerId === 'btg-pactual' || draft.issuerId === 'banco-pan')
            .reduce((sum: number, draft) => sum + draft.appliedMinor, 0);

        expect(sofisa?.maturityDate).toBe(addDays(today, 45));
        expect(btgGroup).toBeGreaterThan(25_000_000);
    });
});
