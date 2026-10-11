import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { z } from 'zod';
import { DateUtil } from '../../../shared/utils/date.util';
import { decimalStringOf } from '../../../shared/utils/decimal.util';
import { marketDataConfig } from '../config/market-data.config';
import { ProviderError } from '../domain/market-data.errors';
import { FAILURE_REASONS, FAILURE_STAGES, QUOTE_PROVIDER_IDS, QuoteProviderId } from '../domain/market-data.types';
import { ProviderAsset, ProviderQuote } from '../ports/quote-provider.port';
import { ProviderBudgetService } from '../services/provider-budget.service';
import { FinnhubQuote, finnhubQuoteSchema } from '../validation/market-data.schemas';
import { requestJson } from './provider-http';
import { SequentialQuoteDriver } from './sequential-quote.driver';

const MAX_BATCH: number = 30;
const US_TIMEZONE: string = 'America/New_York';

@Injectable()
export class FinnhubQuoteDriver extends SequentialQuoteDriver {
    public readonly provider: QuoteProviderId = QUOTE_PROVIDER_IDS.finnhub;
    public readonly maxBatchSize: number = MAX_BATCH;

    public constructor(
        @Inject(marketDataConfig.KEY) private readonly config: ConfigType<typeof marketDataConfig>,
        budget: ProviderBudgetService
    ) {
        super(budget);
    }

    protected async fetchOne(asset: ProviderAsset): Promise<ProviderQuote> {
        const key: string | undefined = this.config.FINNHUB_API_KEY;
        if (key === undefined) {
            throw new ProviderError(FAILURE_STAGES.request, FAILURE_REASONS.rejected);
        }
        const url: string = `${this.config.FINNHUB_BASE_URL}/quote?symbol=${encodeURIComponent(asset.externalId)}`;
        const body: unknown = await requestJson(url, { 'X-Finnhub-Token': key }, this.config.MARKET_DATA_HTTP_TIMEOUT_MS);
        const parsed: z.SafeParseReturnType<unknown, FinnhubQuote> = finnhubQuoteSchema.safeParse(body);
        if (!parsed.success) {
            throw ProviderError.formatInvalid();
        }
        if (parsed.data.c === 0 && parsed.data.t === 0) {
            throw new ProviderError(FAILURE_STAGES.notFound, FAILURE_REASONS.symbolUnknown);
        }
        return {
            assetId: asset.assetId,
            price: decimalStringOf(parsed.data.c),
            currency: asset.currency,
            priceDate: DateUtil.localDateIn(US_TIMEZONE, new Date(parsed.data.t * 1000)),
            source: this.provider
        };
    }
}
