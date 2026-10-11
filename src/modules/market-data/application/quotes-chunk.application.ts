import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { MESSAGE_TYPES } from '../../../shared/constants/queues.constants';
import { AssetCatalogService } from '../../catalog/services/asset-catalog.service';
import { QuotableAsset, QuoteGroup } from '../domain/market-data.types';
import { MarketDataLogService } from '../services/market-data-log.service';
import { QuoteCollectorService } from '../services/quote-collector.service';
import { ChunkPayload, OnDemandPayload, chunkPayloadSchema, onDemandPayloadSchema } from '../validation/market-data.schemas';

@Injectable()
export class QuotesChunkApplication {
    public constructor(
        private readonly catalog: AssetCatalogService,
        private readonly collector: QuoteCollectorService,
        private readonly logs: MarketDataLogService
    ) {}

    public async handleChunk(payload: unknown): Promise<void> {
        const parsed: z.SafeParseReturnType<unknown, ChunkPayload> = chunkPayloadSchema.safeParse(payload);
        if (!parsed.success) {
            this.logs.invalidPayload(MESSAGE_TYPES.marketDataQuotesChunkRequested);
            return;
        }
        const assets: QuotableAsset[] = await this.catalog.findManyByIds(parsed.data.assetIds);
        await this.collector.collect(parsed.data.provider, assets);
    }

    public async handleOnDemand(payload: unknown): Promise<void> {
        const parsed: z.SafeParseReturnType<unknown, OnDemandPayload> = onDemandPayloadSchema.safeParse(payload);
        if (!parsed.success) {
            this.logs.invalidPayload(MESSAGE_TYPES.marketDataQuoteOndemandRequested);
            return;
        }
        const asset: QuotableAsset | null = await this.catalog.findById(parsed.data.assetId);
        if (asset === null) {
            this.logs.invalidPayload(MESSAGE_TYPES.marketDataQuoteOndemandRequested);
            return;
        }
        await this.collector.collect(asset.quotesProvider as QuoteGroup, [asset]);
    }
}
