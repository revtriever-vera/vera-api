import { Selectable } from 'kysely';
import { Assets, CatalogSyncRuns, DB } from '../../../core/database/generated/database.types';

export const MARKETS = {
    b3: 'B3',
    us: 'US',
    crypto: 'CRYPTO',
    tesouro: 'TESOURO'
} as const;

export type CatalogMarket = (typeof MARKETS)[keyof typeof MARKETS];

export const CATALOG_SOURCES = {
    b3: 'b3',
    us: 'us',
    crypto: 'crypto',
    tesouro: 'tesouro'
} as const;

export type CatalogSource = (typeof CATALOG_SOURCES)[keyof typeof CATALOG_SOURCES];

export const MARKET_BY_SOURCE: Readonly<Record<CatalogSource, CatalogMarket>> = {
    b3: MARKETS.b3,
    us: MARKETS.us,
    crypto: MARKETS.crypto,
    tesouro: MARKETS.tesouro
};

export const ASSET_KINDS = {
    stock: 'stock',
    etf: 'etf',
    fii: 'fii',
    bdr: 'bdr',
    reit: 'reit',
    crypto: 'crypto',
    treasury: 'treasury'
} as const;

export type AssetKind = (typeof ASSET_KINDS)[keyof typeof ASSET_KINDS];

export const TYPE_GROUPS = {
    acoesBr: 'acoes_br',
    fii: 'fii',
    acoesEua: 'acoes_eua',
    reits: 'reits',
    cripto: 'cripto',
    tesouro: 'tesouro'
} as const;

export type TypeGroup = (typeof TYPE_GROUPS)[keyof typeof TYPE_GROUPS];

export const CLASS_KEYS = {
    rfPos: 'rf_pos',
    rfPre: 'rf_pre',
    rfIpca: 'rf_ipca',
    acoesBr: 'acoes_br',
    fii: 'fii',
    acoesEua: 'acoes_eua',
    reits: 'reits',
    cripto: 'cripto'
} as const;

export type ClassKey = (typeof CLASS_KEYS)[keyof typeof CLASS_KEYS];

export const QUOTES_PROVIDERS = {
    brapi: 'brapi',
    usEquities: 'us_equities',
    coingecko: 'coingecko',
    tesouro: 'tesouro'
} as const;

export type QuotesProvider = (typeof QUOTES_PROVIDERS)[keyof typeof QUOTES_PROVIDERS];

export const ASSET_STATUSES = {
    active: 'active',
    delisted: 'delisted'
} as const;

export type AssetStatus = (typeof ASSET_STATUSES)[keyof typeof ASSET_STATUSES];

export const SYNC_RUN_STATUSES = {
    running: 'running',
    succeeded: 'succeeded',
    failed: 'failed',
    skippedSuspicious: 'skipped_suspicious'
} as const;

export type SyncRunStatus = (typeof SYNC_RUN_STATUSES)[keyof typeof SYNC_RUN_STATUSES];

export const SYNC_CADENCES = {
    weekly: 'weekly',
    tesouroDaily: 'tesouro_daily'
} as const;

export type SyncCadence = (typeof SYNC_CADENCES)[keyof typeof SYNC_CADENCES];

export const SOURCES_BY_CADENCE: Readonly<Record<SyncCadence, readonly CatalogSource[]>> = {
    weekly: [CATALOG_SOURCES.b3, CATALOG_SOURCES.us, CATALOG_SOURCES.crypto],
    tesouro_daily: [CATALOG_SOURCES.tesouro]
};

export interface MarketAttributes {
    readonly quantityDecimals: number;
    readonly quotesProvider: QuotesProvider;
}

export const MARKET_ATTRIBUTES: Readonly<Record<CatalogMarket, MarketAttributes>> = {
    B3: { quantityDecimals: 0, quotesProvider: QUOTES_PROVIDERS.brapi },
    US: { quantityDecimals: 6, quotesProvider: QUOTES_PROVIDERS.usEquities },
    CRYPTO: { quantityDecimals: 8, quotesProvider: QUOTES_PROVIDERS.coingecko },
    TESOURO: { quantityDecimals: 2, quotesProvider: QUOTES_PROVIDERS.tesouro }
};

export const SEARCH_MAX_LIMIT: number = 30;
export const SEARCH_DEFAULT_LIMIT: number = 20;
export const SEARCH_MAX_TEXT_LENGTH: number = 60;
export const SUSPICIOUS_DROP_RATIO: number = 0.8;

type StoredAsset = Selectable<Assets>;

export type Asset = Omit<StoredAsset, 'maturityDate'> & { readonly maturityDate: string | null };
export type CatalogSyncRun = Selectable<CatalogSyncRuns>;

export type AssetWrite = Omit<Asset, 'id' | 'createdAt' | 'updatedAt' | 'seenAt' | 'status' | 'popularRank' | 'rank'> & {
    readonly popularRank: number | null;
    readonly rank: number | null;
};

export interface AssetSearchCriteria {
    readonly group?: TypeGroup;
    readonly text: string;
    readonly likeText: string;
    readonly limit: number;
}

export interface SnapshotResult {
    readonly upserted: number;
    readonly delisted: number;
}

export interface SyncRunOutcome {
    readonly status: SyncRunStatus;
    readonly fetched: number;
    readonly upserted: number;
    readonly delisted: number;
    readonly errorCode: string | null;
}

export interface StoredAssetState {
    readonly externalId: string;
    readonly sourceHash: string | null;
    readonly status: AssetStatus;
}

export interface StatusCount {
    readonly status: AssetStatus;
    readonly total: number;
}

export type AssetsDatabase = Pick<DB, 'Assets'>;

export const SOURCE_ERROR_CODES = {
    unreachable: 'catalog.source_unreachable',
    rateLimited: 'catalog.source_rate_limited',
    unavailable: 'catalog.source_unavailable',
    rejected: 'catalog.source_rejected',
    formatInvalid: 'catalog.source_format_invalid',
    unexpected: 'catalog.sync_unexpected'
} as const;

export type SourceErrorCode = (typeof SOURCE_ERROR_CODES)[keyof typeof SOURCE_ERROR_CODES];
