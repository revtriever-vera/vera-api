import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { QUOTES_MAX_IDS, QUOTE_GROUPS } from '../domain/market-data.types';

export const quotesQuerySchema = z.object({
    assetIds: z
        .string()
        .transform((value: string): string[] => value.split(',').map((entry: string): string => entry.trim()))
        .pipe(z.array(z.string().uuid()).min(1).max(QUOTES_MAX_IDS))
        .describe('Comma separated catalog asset ids, from 1 to 30')
});

export class QuotesQueryDto extends createZodDto(quotesQuerySchema) {}

export const quoteItemSchema = z.object({
    assetId: z.string().uuid().describe('Catalog asset id'),
    price: z.string().describe('Last known price as a decimal string, in the asset currency'),
    currency: z.string().length(3).describe('ISO 4217 currency of the price'),
    priceDate: z.string().describe('Date (YYYY-MM-DD) of the session the price refers to'),
    source: z.string().describe('Provider that answered: brapi, finnhub, twelvedata, alphavantage, coingecko, tesouro or mock'),
    stale: z.boolean().describe('Whether the price is older than the freshness window; the value is still shown, with a warning')
});

export type QuoteItem = z.infer<typeof quoteItemSchema>;

export const quotesResponseSchema = z.object({
    quotes: z.array(quoteItemSchema).describe('Prices already stored'),
    pendingAssetIds: z.array(z.string().uuid()).describe('Assets without a price yet; a background fetch was queued for them')
});

export type QuotesResponse = z.infer<typeof quotesResponseSchema>;

export const exchangeRateParamSchema = z.object({
    currency: z
        .string()
        .regex(/^[A-Z]{3}$/)
        .describe('ISO 4217 code of the foreign currency; USD in the MVP')
});

export class ExchangeRateParamDto extends createZodDto(exchangeRateParamSchema) {}

export const exchangeRateResponseSchema = z.object({
    currency: z.string().length(3).describe('ISO 4217 code of the currency'),
    brlPerUnit: z.string().describe('How many reais one unit of the currency is worth, as a decimal string'),
    date: z.string().describe('Date (YYYY-MM-DD) of the rate, the latest on or before today'),
    source: z.string().describe('bcb-ptax, or mock outside live environments')
});

export type ExchangeRateResponse = z.infer<typeof exchangeRateResponseSchema>;

export const chunkPayloadSchema = z.object({
    provider: z.enum([QUOTE_GROUPS.brapi, QUOTE_GROUPS.usEquities, QUOTE_GROUPS.coingecko]),
    assetIds: z.array(z.string().uuid()).min(1)
});

export type ChunkPayload = z.infer<typeof chunkPayloadSchema>;

export const onDemandPayloadSchema = z.object({
    assetId: z.string().uuid()
});

export type OnDemandPayload = z.infer<typeof onDemandPayloadSchema>;

export const brapiResponseSchema = z.object({
    results: z.array(
        z.object({
            symbol: z.string().min(1),
            regularMarketPrice: z.number().nullable().optional(),
            regularMarketTime: z.string().nullable().optional()
        })
    )
});

export type BrapiResponse = z.infer<typeof brapiResponseSchema>;

export const finnhubQuoteSchema = z.object({
    c: z.number(),
    pc: z.number().optional(),
    t: z.number()
});

export type FinnhubQuote = z.infer<typeof finnhubQuoteSchema>;

export const twelveDataQuoteSchema = z.union([
    z.object({ close: z.string().min(1), datetime: z.string().regex(/^\d{4}-\d{2}-\d{2}/), status: z.undefined().optional() }),
    z.object({ status: z.literal('error'), code: z.number().optional() })
]);

export type TwelveDataQuote = z.infer<typeof twelveDataQuoteSchema>;

export const alphaVantageQuoteSchema = z.object({
    'Global Quote': z
        .object({
            '05. price': z.string().optional(),
            '07. latest trading day': z.string().optional()
        })
        .optional(),
    Note: z.string().optional(),
    Information: z.string().optional()
});

export type AlphaVantageQuote = z.infer<typeof alphaVantageQuoteSchema>;

export const coingeckoPriceSchema = z.record(z.string(), z.object({ usd: z.number().optional(), last_updated_at: z.number().optional() }));

export type CoingeckoPrices = z.infer<typeof coingeckoPriceSchema>;

export const ptaxResponseSchema = z.object({
    value: z.array(z.object({ cotacaoVenda: z.number() }))
});

export type PtaxResponse = z.infer<typeof ptaxResponseSchema>;
