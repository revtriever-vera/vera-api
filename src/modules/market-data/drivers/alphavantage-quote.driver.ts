import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { z } from 'zod';
import { decimalStringOf } from '../../../shared/utils/decimal.util';
import { marketDataConfig } from '../config/market-data.config';
import { ProviderError } from '../domain/market-data.errors';
import { FAILURE_REASONS, FAILURE_STAGES, QUOTE_PROVIDER_IDS, QuoteProviderId } from '../domain/market-data.types';
import { ProviderAsset, ProviderQuote } from '../ports/quote-provider.port';
import { ProviderBudgetService } from '../services/provider-budget.service';
import { AlphaVantageQuote, alphaVantageQuoteSchema } from '../validation/market-data.schemas';
import { requestJson } from './provider-http';
import { SequentialQuoteDriver } from './sequential-quote.driver';

const MAX_BATCH: number = 5;
const RATE_LIMITED_STATUS: number = 429;

@Injectable()
export class AlphaVantageQuoteDriver extends SequentialQuoteDriver {
    public readonly provider: QuoteProviderId = QUOTE_PROVIDER_IDS.alphavantage;
    public readonly maxBatchSize: number = MAX_BATCH;

    public constructor(
        @Inject(marketDataConfig.KEY) private readonly config: ConfigType<typeof marketDataConfig>,
        budget: ProviderBudgetService
    ) {
        super(budget);
    }

    protected async fetchOne(asset: ProviderAsset): Promise<ProviderQuote> {
        const key: string | undefined = this.config.ALPHAVANTAGE_API_KEY;
        if (key === undefined) {
            throw new ProviderError(FAILURE_STAGES.request, FAILURE_REASONS.rejected);
        }
        const url: string = `${this.config.ALPHAVANTAGE_BASE_URL}/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(asset.externalId)}&apikey=${encodeURIComponent(key)}`;
        const body: unknown = await requestJson(url, {}, this.config.MARKET_DATA_HTTP_TIMEOUT_MS);
        const parsed: z.SafeParseReturnType<unknown, AlphaVantageQuote> = alphaVantageQuoteSchema.safeParse(body);
        if (!parsed.success) {
            throw ProviderError.formatInvalid();
        }
        return this.quoteOf(asset, parsed.data);
    }

    private quoteOf(asset: ProviderAsset, body: AlphaVantageQuote): ProviderQuote {
        if (body.Note !== undefined || body.Information !== undefined) {
            throw ProviderError.ofStatus(RATE_LIMITED_STATUS);
        }
        const price: string | undefined = body['Global Quote']?.['05. price'];
        const day: string | undefined = body['Global Quote']?.['07. latest trading day'];
        if (price === undefined || day === undefined) {
            throw new ProviderError(FAILURE_STAGES.notFound, FAILURE_REASONS.symbolUnknown);
        }
        return { assetId: asset.assetId, price: decimalStringOf(price), currency: asset.currency, priceDate: day, source: this.provider };
    }
}
