import { Injectable } from '@nestjs/common';
import { Asset, AssetCatalogService } from '../../catalog/services/asset-catalog.service';
import { QuoteReaderService, StoredQuote } from '../../market-data/services/quote-reader.service';
import { LOOKUP_MAX_RESULTS, LookupEntry } from '../domain/asset-lookup.types';

export { LOOKUP_MAX_RESULTS };
export type { LookupEntry };

@Injectable()
export class AssetLookupService {
    public constructor(
        private readonly catalog: AssetCatalogService,
        private readonly quotes: QuoteReaderService
    ) {}

    public async lookup(query: string): Promise<LookupEntry[]> {
        const found: Asset[] = await this.catalog.searchAny(query, LOOKUP_MAX_RESULTS);
        if (found.length === 0) {
            return [];
        }
        const latest: ReadonlyMap<string, StoredQuote> = await this.quotes.getLatest(found.map((asset: Asset): string => asset.id));
        return found.map((asset: Asset): LookupEntry => this.entryOf(asset, latest.get(asset.id)));
    }

    private entryOf(asset: Asset, quote: StoredQuote | undefined): LookupEntry {
        return {
            externalId: asset.externalId,
            symbol: asset.symbol,
            name: asset.name,
            market: asset.market,
            kind: asset.kind,
            typeGroup: asset.typeGroup,
            suggestedClassKey: asset.suggestedClassKey,
            currency: asset.currency,
            quote: quote === undefined ? null : { price: quote.price, currency: quote.currency, date: quote.priceDate, stale: quote.stale }
        };
    }
}
