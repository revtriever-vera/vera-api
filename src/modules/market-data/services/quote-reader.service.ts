import { Injectable } from '@nestjs/common';
import { QueuePublisherPort } from '../../../core/queue/queue.types';
import { MESSAGE_TYPES, QUEUES } from '../../../shared/constants/queues.constants';
import { DateUtil } from '../../../shared/utils/date.util';
import { AssetCatalogService } from '../../catalog/services/asset-catalog.service';
import { AssetQuoteDomain } from '../domain/asset-quote.domain';
import { LatestQuotes, QuotableAsset, QuoteMarket, QuoteRecord, StoredQuote } from '../domain/market-data.types';
import { isQuoteStale } from '../domain/quote-staleness';

@Injectable()
export class QuoteReaderService {
    public constructor(
        private readonly quotes: AssetQuoteDomain,
        private readonly catalog: AssetCatalogService,
        private readonly publisher: QueuePublisherPort
    ) {}

    public async getLatest(assetIds: readonly string[]): Promise<ReadonlyMap<string, StoredQuote>> {
        return (await this.getLatestWithPending(assetIds)).quotes;
    }

    public async getLatestWithPending(assetIds: readonly string[]): Promise<LatestQuotes> {
        const assets: QuotableAsset[] = await this.catalog.findManyByIds([...new Set<string>(assetIds)]);
        const records: QuoteRecord[] = await this.quotes.findByAssetIds(assets.map((asset: QuotableAsset): string => asset.id));
        const today: string = DateUtil.todayInBrazil();
        const stored: Map<string, StoredQuote> = new Map<string, StoredQuote>();
        const marketById: ReadonlyMap<string, string> = new Map<string, string>(
            assets.map((asset: QuotableAsset): [string, string] => [asset.id, asset.market])
        );
        for (const record of records) {
            const market: QuoteMarket = (marketById.get(record.assetId) ?? 'B3') as QuoteMarket;
            stored.set(record.assetId, { ...record, stale: isQuoteStale(record.priceDate, market, today) });
        }
        const refresh: QuotableAsset[] = assets.filter((asset: QuotableAsset): boolean => stored.get(asset.id)?.stale !== false);
        await this.requestRefresh(refresh, today);
        const pending: string[] = assets
            .filter((asset: QuotableAsset): boolean => !stored.has(asset.id))
            .map((asset: QuotableAsset): string => asset.id);
        return { quotes: stored, pendingAssetIds: pending };
    }

    private async requestRefresh(assets: readonly QuotableAsset[], day: string): Promise<void> {
        await Promise.all(
            assets.map(async (asset: QuotableAsset): Promise<void> =>
                this.publisher.publish(
                    QUEUES.marketData,
                    MESSAGE_TYPES.marketDataQuoteOndemandRequested,
                    { assetId: asset.id },
                    { jobId: `quote-ondemand-${asset.id}-${day}` }
                )
            )
        );
    }
}
