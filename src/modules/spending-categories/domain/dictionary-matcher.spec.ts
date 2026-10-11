import { describe, expect, it } from 'vitest';
import { DictionaryEntry } from '../validation/data.schemas';
import { buildDictionaryIndex, MERCHANT_DICTIONARY, matchDictionary } from './dictionary-matcher';

function categoryOf(description: string, amountMinor: number = -1000): string | null {
    return matchDictionary(MERCHANT_DICTIONARY, description, amountMinor)?.category ?? null;
}

describe('matchDictionary', () => {
    it('casa os exemplos do card', () => {
        expect(categoryOf('IFOOD RESTAURANTE SABOR')).toBe('eating_out');
        expect(categoryOf('SHELL BOX POSTO')).toBe('transport');
        expect(categoryOf('PAGAMENTO FATURA NUBANK', 5000)).toBe('card_payment');
    });

    it('RESGATE casa só com entrada e APLICACAO só com saída', () => {
        expect(categoryOf('RESGATE CDB', 100000)).toBe('investments');
        expect(categoryOf('RESGATE CDB', -100000)).toBeNull();
        expect(categoryOf('APLICACAO CDB', -100000)).toBe('investments');
        expect(categoryOf('APLICACAO CDB', 100000)).toBeNull();
    });

    it('o padrão mais longo vence', () => {
        expect(categoryOf('UBER EATS PEDIDO')).toBe('eating_out');
        expect(categoryOf('UBER TRIP')).toBe('transport');
    });

    it('contains exige palavra inteira e prefix aceita sufixo colado', () => {
        expect(categoryOf('MEDIA LOJA')).toBeNull();
        expect(categoryOf('DIA SUPERMERCADOS')).toBe('groceries');
        expect(categoryOf('NETFLIXCOM')).toBe('subscriptions');
        expect(categoryOf('COMPRA NETFLIX')).toBeNull();
    });

    it('devolve nulo para descrição desconhecida ou vazia', () => {
        expect(categoryOf('LOJINHA DO ZE')).toBeNull();
        expect(categoryOf('')).toBeNull();
    });
});

describe('buildDictionaryIndex', () => {
    it('ordena por tamanho decrescente e depois alfabeticamente', () => {
        const entries: DictionaryEntry[] = [
            { pattern: 'BB', match: 'contains', category: 'shopping', direction: 'any' },
            { pattern: 'AAA', match: 'contains', category: 'shopping', direction: 'any' },
            { pattern: 'AA', match: 'contains', category: 'shopping', direction: 'any' }
        ];

        expect(buildDictionaryIndex(entries).map((entry: DictionaryEntry) => entry.pattern)).toEqual(['AAA', 'AA', 'BB']);
    });
});
