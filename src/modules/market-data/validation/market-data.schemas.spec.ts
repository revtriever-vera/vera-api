import { describe, expect, it } from 'vitest';
import {
    alphaVantageQuoteSchema,
    chunkPayloadSchema,
    exchangeRateParamSchema,
    finnhubQuoteSchema,
    onDemandPayloadSchema,
    ptaxResponseSchema,
    quotesQuerySchema,
    twelveDataQuoteSchema
} from './market-data.schemas';

const ID_A = '00000000-0000-4000-8000-00000000000a';
const ID_B = '00000000-0000-4000-8000-00000000000b';

describe('quotesQuerySchema', () => {
    it('separa os ids por vírgula e apara os espaços', () => {
        const parsed = quotesQuerySchema.safeParse({ assetIds: ` ${ID_A} , ${ID_B}` });

        expect(parsed.data?.assetIds).toEqual([ID_A, ID_B]);
    });

    it('rejeita lista vazia, id que não é uuid e mais de 30 ids', () => {
        const many = Array.from({ length: 31 }, () => ID_A).join(',');

        for (const assetIds of ['', `${ID_A},abc`, `${ID_A},,${ID_B}`, many]) {
            expect(quotesQuerySchema.safeParse({ assetIds }).success).toBe(false);
        }
    });

    it('aceita exatamente 30 ids', () => {
        const thirty = Array.from({ length: 30 }, () => ID_A).join(',');

        expect(quotesQuerySchema.safeParse({ assetIds: thirty }).success).toBe(true);
    });
});

describe('exchangeRateParamSchema', () => {
    it('aceita só código de três letras maiúsculas', () => {
        expect(exchangeRateParamSchema.safeParse({ currency: 'USD' }).success).toBe(true);
        for (const currency of ['usd', 'US', 'USDT', 'U1D', '']) {
            expect(exchangeRateParamSchema.safeParse({ currency }).success).toBe(false);
        }
    });
});

describe('payloads de fila', () => {
    it('chunk exige provedor conhecido e ao menos um ativo', () => {
        expect(chunkPayloadSchema.safeParse({ provider: 'brapi', assetIds: [ID_A] }).success).toBe(true);
        expect(chunkPayloadSchema.safeParse({ provider: 'brapi', assetIds: [] }).success).toBe(false);
        expect(chunkPayloadSchema.safeParse({ provider: 'outro', assetIds: [ID_A] }).success).toBe(false);
    });

    it('sob demanda exige uuid', () => {
        expect(onDemandPayloadSchema.safeParse({ assetId: 'x' }).success).toBe(false);
    });
});

describe('respostas dos provedores', () => {
    it('TwelveData distingue cotação de erro', () => {
        expect(twelveDataQuoteSchema.safeParse({ close: '10.5', datetime: '2025-01-02' }).success).toBe(true);
        expect(twelveDataQuoteSchema.safeParse({ status: 'error', code: 429 }).success).toBe(true);
        expect(twelveDataQuoteSchema.safeParse({ close: '', datetime: '2025-01-02' }).success).toBe(false);
        expect(twelveDataQuoteSchema.safeParse({ close: '10', datetime: '02/01/2025' }).success).toBe(false);
    });

    it('Finnhub exige preço e instante numéricos', () => {
        expect(finnhubQuoteSchema.safeParse({ c: 10, t: 1 }).success).toBe(true);
        expect(finnhubQuoteSchema.safeParse({ c: '10', t: 1 }).success).toBe(false);
    });

    it('Alpha Vantage aceita aviso de limite sem cotação', () => {
        expect(alphaVantageQuoteSchema.safeParse({ Note: 'rate limit' }).success).toBe(true);
        expect(alphaVantageQuoteSchema.safeParse({ 'Global Quote': { '05. price': 1 } }).success).toBe(false);
    });

    it('PTAX exige cotação de venda numérica', () => {
        expect(ptaxResponseSchema.safeParse({ value: [{ cotacaoVenda: 5.1 }] }).success).toBe(true);
        expect(ptaxResponseSchema.safeParse({ value: [{ cotacaoVenda: '5.1' }] }).success).toBe(false);
    });
});
