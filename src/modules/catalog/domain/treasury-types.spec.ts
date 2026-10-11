import { describe, expect, it } from 'vitest';
import { treasuryTypeOf } from './treasury-types';

describe('treasuryTypeOf', () => {
    it.each([
        ['Tesouro Selic', 'selic'],
        ['Tesouro Prefixado', 'prefixado'],
        ['Tesouro Prefixado com Juros Semestrais', 'prefixado-juros-semestrais'],
        ['Tesouro IPCA+', 'ipca'],
        ['Tesouro IPCA+ com Juros Semestrais', 'ipca-juros-semestrais'],
        ['Tesouro Renda+ Aposentadoria Extra', 'renda-mais'],
        ['Tesouro RendA+', 'renda-mais'],
        ['  tesouro   educa+ ', 'educa-mais']
    ])('maps %s to %s', (name: string, slug: string) => {
        expect(treasuryTypeOf(name)?.slug).toBe(slug);
    });

    it('ignores accents and case and rejects unknown types', () => {
        expect(treasuryTypeOf('TESOURO PRÉFIXADO')?.slug).toBe('prefixado');
        expect(treasuryTypeOf('Tesouro IGPM+ com Juros Semestrais')).toBeNull();
    });
});
