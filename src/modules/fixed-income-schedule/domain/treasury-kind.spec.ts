import { describe, expect, it } from 'vitest';
import { TreasuryAsset, treasuryKindOf } from './treasury-kind';

function asset(overrides: Partial<TreasuryAsset> = {}): TreasuryAsset {
    return {
        market: 'TESOURO',
        kind: 'treasury',
        externalId: 'selic:2029-03-01',
        suggestedClassKey: 'rf_pos',
        maturityDate: '2029-03-01',
        ...overrides
    };
}

describe('treasuryKindOf', () => {
    it('mapeia a classe sugerida para o tipo do Tesouro', () => {
        expect(treasuryKindOf(asset())).toBe('selic');
        expect(treasuryKindOf(asset({ externalId: 'prefixado:2029-01-01', suggestedClassKey: 'rf_pre' }))).toBe('prefixado');
        expect(treasuryKindOf(asset({ externalId: 'ipca:2035-05-15', suggestedClassKey: 'rf_ipca' }))).toBe('ipca');
    });

    it('ignora o que não é Tesouro, não tem vencimento ou não tem classe', () => {
        expect(treasuryKindOf(asset({ market: 'B3' }))).toBeNull();
        expect(treasuryKindOf(asset({ kind: 'stock' }))).toBeNull();
        expect(treasuryKindOf(asset({ maturityDate: null }))).toBeNull();
        expect(treasuryKindOf(asset({ suggestedClassKey: null }))).toBeNull();
        expect(treasuryKindOf(asset({ suggestedClassKey: 'fii' }))).toBeNull();
    });

    it('deixa de fora os títulos com cupom e os de renda e educação', () => {
        for (const externalId of [
            'prefixado-juros-semestrais:2033-01-01',
            'ipca-juros-semestrais:2032-08-15',
            'renda-mais:2049-12-15',
            'educa-mais:2040-01-01'
        ]) {
            expect(treasuryKindOf(asset({ externalId, suggestedClassKey: 'rf_ipca' }))).toBeNull();
        }
    });
});
