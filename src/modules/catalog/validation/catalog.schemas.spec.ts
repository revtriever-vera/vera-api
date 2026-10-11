import { describe, expect, it } from 'vitest';
import { assetSearchQuerySchema, coingeckoMarketsSchema, finnhubSymbolsSchema, syncSourcePayloadSchema } from './catalog.schemas';
import { curatedEntrySchema, seedAssetSchema } from './curated-maps.schemas';

describe('assetSearchQuerySchema', () => {
    it('aplica o limite padrão de 20 e apara o texto', () => {
        const parsed = assetSearchQuerySchema.safeParse({ q: '  petr ' });

        expect(parsed.data).toEqual({ q: 'petr', limit: 20 });
    });

    it('converte o limite vindo da query string', () => {
        expect(assetSearchQuerySchema.safeParse({ limit: '5' }).data?.limit).toBe(5);
    });

    it('rejeita limite fora de 1 a 30, não inteiro e texto acima de 60 caracteres', () => {
        for (const query of [{ limit: '0' }, { limit: '31' }, { limit: '1.5' }, { limit: 'abc' }, { q: 'a'.repeat(61) }]) {
            expect(assetSearchQuerySchema.safeParse(query).success).toBe(false);
        }
    });

    it('aceita os limites 1 e 30 e texto de 60 caracteres', () => {
        expect(assetSearchQuerySchema.safeParse({ limit: '1' }).success).toBe(true);
        expect(assetSearchQuerySchema.safeParse({ limit: '30' }).success).toBe(true);
        expect(assetSearchQuerySchema.safeParse({ q: 'a'.repeat(60) }).success).toBe(true);
    });

    it('rejeita grupo desconhecido', () => {
        expect(assetSearchQuerySchema.safeParse({ group: 'moedas' }).success).toBe(false);
    });
});

describe('syncSourcePayloadSchema', () => {
    it('rejeita fonte desconhecida', () => {
        expect(syncSourcePayloadSchema.safeParse({ source: 'b3' }).success).toBe(true);
        expect(syncSourcePayloadSchema.safeParse({ source: 'eu' }).success).toBe(false);
    });
});

describe('respostas das fontes do catálogo', () => {
    it('Finnhub preenche descrição, tipo e mic ausentes', () => {
        const parsed = finnhubSymbolsSchema.safeParse([{ symbol: 'AAPL' }]);

        expect(parsed.data).toEqual([{ symbol: 'AAPL', description: '', type: '', mic: '' }]);
        expect(finnhubSymbolsSchema.safeParse([{ symbol: '' }]).success).toBe(false);
    });

    it('CoinGecko aceita ranking nulo e rejeita ranking não positivo', () => {
        expect(coingeckoMarketsSchema.safeParse([{ id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', market_cap_rank: null }]).success).toBe(
            true
        );
        expect(coingeckoMarketsSchema.safeParse([{ id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', market_cap_rank: 0 }]).success).toBe(
            false
        );
    });
});

describe('mapas curados', () => {
    it('entrada curada exige símbolo em caixa alta de até 12 caracteres e rejeita campo extra', () => {
        const base = { symbol: 'PETR4', classKey: null, dollarExposure: false };

        expect(curatedEntrySchema.safeParse(base).success).toBe(true);
        expect(curatedEntrySchema.safeParse({ ...base, symbol: 'petr4' }).success).toBe(false);
        expect(curatedEntrySchema.safeParse({ ...base, symbol: 'A'.repeat(13) }).success).toBe(false);
        expect(curatedEntrySchema.safeParse({ ...base, extra: 1 }).success).toBe(false);
    });

    it('ativo semeado valida vencimento e ranking', () => {
        const base = { market: 'TESOURO', externalId: 'x', symbol: 'S', name: 'N', kind: 'treasury', currency: 'BRL' };

        expect(seedAssetSchema.safeParse({ ...base, maturityDate: '2030-01-01', rank: 1 }).success).toBe(true);
        expect(seedAssetSchema.safeParse({ ...base, maturityDate: '01/01/2030' }).success).toBe(false);
        expect(seedAssetSchema.safeParse({ ...base, rank: 0 }).success).toBe(false);
    });
});
