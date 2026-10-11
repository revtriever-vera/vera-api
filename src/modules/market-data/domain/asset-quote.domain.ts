import { Injectable } from '@nestjs/common';
import { AssetQuotesRepository } from '../repositories/asset-quotes.repository';
import { QuoteRecord, QuoteWrite } from './market-data.types';

@Injectable()
export class AssetQuoteDomain {
    public constructor(private readonly quotes: AssetQuotesRepository) {}

    public async findByAssetIds(assetIds: readonly string[]): Promise<QuoteRecord[]> {
        return this.quotes.findByAssetIds(assetIds);
    }

    public async save(quotes: readonly QuoteWrite[], fetchedAt: Date): Promise<number> {
        const latestPerAsset: Map<string, QuoteWrite> = new Map<string, QuoteWrite>();
        for (const quote of quotes) {
            const known: QuoteWrite | undefined = latestPerAsset.get(quote.assetId);
            if (known === undefined || known.priceDate <= quote.priceDate) {
                latestPerAsset.set(quote.assetId, quote);
            }
        }
        return this.quotes.upsertQuotes([...latestPerAsset.values()], fetchedAt);
    }
}
