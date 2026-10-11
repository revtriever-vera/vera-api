import { Selectable } from 'kysely';
import { AssetQuotes, DB, ExchangeRates, QuoteFetchFailures } from '../../../core/database/generated/database.types';

export const QUOTE_PROVIDER_IDS = {
    brapi: 'brapi',
    finnhub: 'finnhub',
    twelvedata: 'twelvedata',
    alphavantage: 'alphavantage',
    coingecko: 'coingecko',
    tesouro: 'tesouro'
} as const;

export type QuoteProviderId = (typeof QUOTE_PROVIDER_IDS)[keyof typeof QUOTE_PROVIDER_IDS];

export const QUOTE_GROUPS = {
    brapi: 'brapi',
    usEquities: 'us_equities',
    coingecko: 'coingecko',
    tesouro: 'tesouro'
} as const;

export type QuoteGroup = (typeof QUOTE_GROUPS)[keyof typeof QUOTE_GROUPS];

export const SWEEP_GROUPS: readonly QuoteGroup[] = [QUOTE_GROUPS.brapi, QUOTE_GROUPS.usEquities, QUOTE_GROUPS.coingecko];

export const GROUP_BY_PROVIDER: Readonly<Record<QuoteProviderId, QuoteGroup>> = {
    brapi: QUOTE_GROUPS.brapi,
    finnhub: QUOTE_GROUPS.usEquities,
    twelvedata: QUOTE_GROUPS.usEquities,
    alphavantage: QUOTE_GROUPS.usEquities,
    coingecko: QUOTE_GROUPS.coingecko,
    tesouro: QUOTE_GROUPS.tesouro
};

export const QUOTE_MARKETS = {
    b3: 'B3',
    us: 'US',
    crypto: 'CRYPTO',
    tesouro: 'TESOURO'
} as const;

export type QuoteMarket = (typeof QUOTE_MARKETS)[keyof typeof QUOTE_MARKETS];

export const FAILURE_STAGES = {
    request: 'request',
    parse: 'parse',
    notFound: 'not_found',
    budget: 'budget'
} as const;

export type FailureStage = (typeof FAILURE_STAGES)[keyof typeof FAILURE_STAGES];

export const FAILURE_REASONS = {
    unreachable: 'market-data.provider_unreachable',
    rateLimited: 'market-data.provider_rate_limited',
    unavailable: 'market-data.provider_unavailable',
    rejected: 'market-data.provider_rejected',
    formatInvalid: 'market-data.provider_format_invalid',
    symbolUnknown: 'market-data.symbol_unknown',
    budgetExhausted: 'market-data.budget_exhausted',
    unexpected: 'market-data.unexpected'
} as const;

export type FailureReason = (typeof FAILURE_REASONS)[keyof typeof FAILURE_REASONS];

export const BUDGET_WINDOWS = {
    minute: 'minute',
    day: 'day',
    month: 'month'
} as const;

export type BudgetWindow = (typeof BUDGET_WINDOWS)[keyof typeof BUDGET_WINDOWS];

export type BudgetLimits = Readonly<Partial<Record<BudgetWindow, number>>>;

export const FETCH_RESULTS = {
    ok: 'ok',
    failed: 'failed'
} as const;

export const SUPPORTED_RATE_CURRENCIES: readonly string[] = ['USD'];
export const BASE_CURRENCY: string = 'BRL';
export const PTAX_SOURCE: string = 'bcb-ptax';
export const MOCK_SOURCE: string = 'mock';
export const RATE_LOOKBACK_DAYS: number = 7;
export const USAGE_RETENTION_DAYS: number = 40;
export const QUOTES_MAX_IDS: number = 30;

export type StoredQuoteRow = Selectable<AssetQuotes>;
export type StoredRateRow = Selectable<ExchangeRates>;
export type QuoteFetchFailureRow = Selectable<QuoteFetchFailures>;

export interface QuotableAsset {
    readonly id: string;
    readonly market: string;
    readonly externalId: string;
    readonly symbol: string;
    readonly currency: string;
    readonly quotesProvider: string;
}

export interface QuoteRecord {
    readonly assetId: string;
    readonly price: string;
    readonly currency: string;
    readonly priceDate: string;
    readonly source: string;
}

export interface UsageSlot {
    readonly provider: string;
    readonly windowKind: BudgetWindow;
    readonly windowStart: Date;
}

export interface StoredQuote {
    readonly assetId: string;
    readonly price: string;
    readonly currency: string;
    readonly priceDate: string;
    readonly source: string;
    readonly stale: boolean;
}

export interface StoredRate {
    readonly currency: string;
    readonly brlPerUnit: string;
    readonly date: string;
    readonly source: string;
}

export interface QuoteWrite {
    readonly assetId: string;
    readonly price: string;
    readonly currency: string;
    readonly priceDate: string;
    readonly source: string;
}

export interface RateWrite {
    readonly currency: string;
    readonly date: string;
    readonly brlPerUnit: string;
    readonly source: string;
}

export interface FailureWrite {
    readonly assetId: string | null;
    readonly provider: string;
    readonly stage: FailureStage;
    readonly reason: string;
}

export interface LatestQuotes {
    readonly quotes: ReadonlyMap<string, StoredQuote>;
    readonly pendingAssetIds: readonly string[];
}

export type MarketDataDatabase = Pick<DB, 'AssetQuotes' | 'ExchangeRates' | 'QuoteFetchFailures' | 'ProviderUsage'>;
