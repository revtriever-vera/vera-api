import { describe, expect, it } from 'vitest';
import { HELP_CATALOG } from './help-catalog';
import { normalizedWords, searchHelp } from './help-search';
import { HelpEntry } from './help.types';

function idsOf(query: string, locale: 'pt-BR' | 'en' = 'pt-BR'): string[] {
    return searchHelp(HELP_CATALOG, query, locale).map((entry: HelpEntry): string => entry.id);
}

describe('normalizedWords', () => {
    it('tira acento, caixa e palavras vazias', () => {
        expect(normalizedWords('Como eu IMPORTO o extrato?')).toEqual(['importo', 'extrato']);
    });
});

describe('searchHelp', () => {
    it('acha pela palavra-chave', () => {
        expect(idsOf('onde aportar')[0]).toBe('portfolio-contribution');
        expect(idsOf('meta de economia')[0]).toBe('savings-goal');
    });

    it('acha por sinônimo', () => {
        expect(idsOf('como faço para reduzir gastos')).toContain('spending-cuts');
        expect(idsOf('quanto custa o premium')[0]).toBe('plan-premium');
        expect(idsOf('how do I delete my account', 'en')[0]).toBe('delete-account');
    });

    it('acha pelo plural e pela forma conjugada', () => {
        expect(idsOf('como importo meus extratos')[0]).toBe('import-statement');
    });

    it('devolve no máximo 3 entradas', () => {
        expect(idsOf('carteira ativos meta aporte objetivos gastos').length).toBeLessThanOrEqual(3);
    });

    it('devolve vazio sem resultado ou sem palavra útil', () => {
        expect(idsOf('receita de bolo de cenoura')).toEqual([]);
        expect(idsOf('como o')).toEqual([]);
        expect(idsOf('')).toEqual([]);
    });
});
