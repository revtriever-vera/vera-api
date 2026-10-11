import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { ASSET_KINDS, MARKETS, SEARCH_DEFAULT_LIMIT, SEARCH_MAX_LIMIT, SEARCH_MAX_TEXT_LENGTH, TYPE_GROUPS } from '../domain/catalog.types';

export const assetSearchQuerySchema = z.object({
    group: z
        .nativeEnum(TYPE_GROUPS)
        .optional()
        .describe('Registration type card that narrows the search: acoes_br, fii, acoes_eua, reits, cripto or tesouro'),
    q: z
        .string()
        .trim()
        .max(SEARCH_MAX_TEXT_LENGTH)
        .optional()
        .describe('Ticker or name fragment, up to 60 characters; empty or missing lists the popular assets of the group'),
    limit: z.coerce
        .number()
        .int()
        .min(1)
        .max(SEARCH_MAX_LIMIT)
        .default(SEARCH_DEFAULT_LIMIT)
        .describe('Maximum number of results, from 1 to 30 (default 20)')
});

export class AssetSearchQueryDto extends createZodDto(assetSearchQuerySchema) {}

export type AssetSearchQuery = z.infer<typeof assetSearchQuerySchema>;

export const assetItemSchema = z.object({
    id: z.string().uuid().describe('Catalog asset id'),
    symbol: z.string().describe('Display symbol, e.g. ITUB4, VOO, BTC or "Tesouro IPCA+ 2035"'),
    name: z.string().describe('Asset name as given by the source'),
    market: z.nativeEnum(MARKETS).describe('Market the asset comes from'),
    kind: z.nativeEnum(ASSET_KINDS).describe('Instrument kind'),
    typeGroup: z.nativeEnum(TYPE_GROUPS).describe('Registration type card the asset belongs to, following its exposure'),
    currency: z.enum(['BRL', 'USD']).describe('Currency of the quotes'),
    suggestedClassKey: z
        .string()
        .nullable()
        .describe('Standard class suggested by exposure; null when there is no obvious default and the user must choose'),
    dollarExposure: z.boolean().describe('Whether the asset exposes the portfolio to the US dollar'),
    quantityDecimals: z.number().int().describe('Decimal places accepted in the position quantity'),
    maturityDate: z.string().nullable().describe('Maturity date (YYYY-MM-DD) for Tesouro Direto bonds, otherwise null')
});

export type AssetItem = z.infer<typeof assetItemSchema>;

export const assetSearchResponseSchema = z.object({
    data: z.array(assetItemSchema).describe('Assets ordered by relevance, at most 30')
});

export type AssetSearchResponse = z.infer<typeof assetSearchResponseSchema>;

export const syncTickPayloadSchema = z.object({
    cadence: z.enum(['weekly', 'tesouro_daily']).optional()
});

export type SyncTickPayload = z.infer<typeof syncTickPayloadSchema>;

export const syncSourcePayloadSchema = z.object({
    source: z.enum(['b3', 'us', 'crypto', 'tesouro'])
});

export type SyncSourcePayload = z.infer<typeof syncSourcePayloadSchema>;

export const finnhubSymbolsSchema = z.array(
    z.object({
        symbol: z.string().min(1),
        description: z.string().default(''),
        type: z.string().default(''),
        mic: z.string().default('')
    })
);

export type FinnhubSymbol = z.infer<typeof finnhubSymbolsSchema>[number];

export const coingeckoMarketsSchema = z.array(
    z.object({
        id: z.string().min(1),
        symbol: z.string().min(1),
        name: z.string().min(1),
        market_cap_rank: z.number().int().positive().nullable().optional()
    })
);

export type CoinMarket = z.infer<typeof coingeckoMarketsSchema>[number];
