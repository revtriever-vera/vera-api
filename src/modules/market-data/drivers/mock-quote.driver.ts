import { Injectable } from '@nestjs/common';
import { HashUtil } from '../../../shared/utils/hash.util';
import { MOCK_SOURCE, QuoteProviderId } from '../domain/market-data.types';
import { expectedPriceDate } from '../domain/quote-staleness';
import { ProviderAsset, ProviderBatchResult, ProviderQuote, QuoteProviderPort } from '../ports/quote-provider.port';

export const MOCK_PRICES: Readonly<Record<string, string>> = {
    'B3:ITUB4': '37.80',
    'B3:WEGE3': '52.10',
    'B3:PETR4': '36.90',
    'B3:HGLG11': '158',
    'B3:KNRI11': '152',
    'B3:IVVB11': '362',
    'US:VOO': '545',
    'US:AAPL': '228',
    'US:MSFT': '430',
    'US:O': '58',
    'US:VNQ': '92',
    'CRYPTO:bitcoin': '62000',
    'CRYPTO:ethereum': '2600',
    'TESOURO:selic:2029-03-01': '16200',
    'TESOURO:prefixado:2029-01-01': '812',
    'TESOURO:ipca:2035-05-15': '2150'
};

const MOCK_BATCH_SIZE: number = 500;
const HASH_PREFIX_LENGTH: number = 8;
const PRICE_SPAN: number = 49_500;
const PRICE_FLOOR: number = 500;
const CENTS: number = 100;

export function mockPriceOf(asset: ProviderAsset): string {
    const fixed: string | undefined = MOCK_PRICES[`${asset.market}:${asset.externalId}`];
    if (fixed !== undefined) {
        return fixed;
    }
    const seed: number = Number.parseInt(HashUtil.sha256(asset.externalId).slice(0, HASH_PREFIX_LENGTH), 16);
    return ((seed % PRICE_SPAN) / CENTS + PRICE_FLOOR / CENTS).toFixed(2);
}

@Injectable()
export class MockQuoteDriver extends QuoteProviderPort {
    public readonly maxBatchSize: number = MOCK_BATCH_SIZE;

    public constructor(public readonly provider: QuoteProviderId) {
        super();
    }

    public fetchBatch(assets: readonly ProviderAsset[]): Promise<ProviderBatchResult> {
        const now: Date = new Date();
        const quotes: ProviderQuote[] = assets.map((asset: ProviderAsset): ProviderQuote => ({
            assetId: asset.assetId,
            price: mockPriceOf(asset),
            currency: asset.currency,
            priceDate: expectedPriceDate(asset.market, now),
            source: MOCK_SOURCE
        }));
        return Promise.resolve({ quotes, failures: [] });
    }
}
