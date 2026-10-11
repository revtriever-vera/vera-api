import { describe, expect, it } from 'vitest';
import { suggestAccount, SuggestionCandidate } from './account-suggestion';

const ITAU: SuggestionCandidate = { id: 'a1', institutionName: 'Itaú', numberLast4: '5678' };
const NUBANK: SuggestionCandidate = { id: 'a2', institutionName: 'Nubank', numberLast4: '4321' };

describe('suggestAccount', () => {
    it('casa pelos 4 últimos dígitos e pela instituição, sem diferenciar acento e caixa', () => {
        expect(suggestAccount({ institution: 'ITAU', numberLast4: '5678' }, [NUBANK, ITAU])).toBe('a1');
        expect(suggestAccount({ institution: 'Itaú Unibanco', numberLast4: '5678' }, [ITAU])).toBe('a1');
    });

    it('dá nulo quando não há casamento', () => {
        expect(suggestAccount({ institution: 'Itaú', numberLast4: '0000' }, [ITAU])).toBeNull();
        expect(suggestAccount({ institution: 'Bradesco', numberLast4: '5678' }, [ITAU])).toBeNull();
        expect(suggestAccount({ institution: 'Itaú', numberLast4: '5678' }, [])).toBeNull();
    });

    it('dá nulo no empate', () => {
        const twin: SuggestionCandidate = { ...ITAU, id: 'a3' };

        expect(suggestAccount({ institution: 'Itaú', numberLast4: '5678' }, [ITAU, twin])).toBeNull();
    });

    it('dá nulo sem dica, sem últimos dígitos ou sem instituição para comparar', () => {
        expect(suggestAccount(null, [ITAU])).toBeNull();
        expect(suggestAccount({ institution: 'Itaú', numberLast4: null }, [ITAU])).toBeNull();
        expect(suggestAccount({ institution: null, numberLast4: '5678' }, [ITAU])).toBeNull();
        expect(suggestAccount({ institution: 'Itaú', numberLast4: '5678' }, [{ ...ITAU, institutionName: null }])).toBeNull();
    });
});
