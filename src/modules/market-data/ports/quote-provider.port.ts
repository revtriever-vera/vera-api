import { FailureStage, QuoteMarket, QuoteProviderId } from '../domain/market-data.types';

export interface ProviderAsset {
    readonly assetId: string;
    readonly market: QuoteMarket;
    readonly externalId: string;
    readonly symbol: string;
    readonly currency: string;
}

export interface ProviderQuote {
    readonly assetId: string;
    readonly price: string;
    readonly currency: string;
    readonly priceDate: string;
    readonly source: string;
}

export interface ProviderFailure {
    readonly assetId: string;
    readonly stage: FailureStage;
    readonly reason: string;
}

export interface ProviderBatchResult {
    readonly quotes: readonly ProviderQuote[];
    readonly failures: readonly ProviderFailure[];
}

export abstract class QuoteProviderPort {
    public abstract readonly provider: QuoteProviderId;
    public abstract readonly maxBatchSize: number;
    public abstract fetchBatch(assets: readonly ProviderAsset[]): Promise<ProviderBatchResult>;
}

export const QUOTE_PROVIDERS: unique symbol = Symbol('QUOTE_PROVIDERS');
