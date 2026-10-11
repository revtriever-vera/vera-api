import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { z } from 'zod';
import { DateUtil } from '../../../shared/utils/date.util';
import { decimalStringOf } from '../../../shared/utils/decimal.util';
import { marketDataConfig } from '../config/market-data.config';
import { ProviderError } from '../domain/market-data.errors';
import { FAILURE_REASONS, FAILURE_STAGES, QUOTE_PROVIDER_IDS, QuoteProviderId } from '../domain/market-data.types';
import { ProviderAsset, ProviderBatchResult, ProviderFailure, ProviderQuote, QuoteProviderPort } from '../ports/quote-provider.port';
import { ProviderBudgetService } from '../services/provider-budget.service';
import { CoingeckoPrices, coingeckoPriceSchema } from '../validation/market-data.schemas';
import { budgetFailures, failureOf, failuresFor } from './provider-batch';
import { requestJson } from './provider-http';

const MAX_BATCH: number = 250;
const UTC_TIMEZONE: string = 'UTC';

@Injectable()
export class CoinGeckoQuoteDriver extends QuoteProviderPort {
    public readonly provider: QuoteProviderId = QUOTE_PROVIDER_IDS.coingecko;
    public readonly maxBatchSize: number = MAX_BATCH;

    public constructor(
        @Inject(marketDataConfig.KEY) private readonly config: ConfigType<typeof marketDataConfig>,
        private readonly budget: ProviderBudgetService
    ) {
        super();
    }

    public async fetchBatch(assets: readonly ProviderAsset[]): Promise<ProviderBatchResult> {
        if (!(await this.budget.reserve(this.provider, 1))) {
            return { quotes: [], failures: budgetFailures(assets) };
        }
        try {
            return this.readPrices(assets, await this.call(assets));
        } catch (error: unknown) {
            return { quotes: [], failures: failuresFor(assets, error) };
        }
    }

    private async call(assets: readonly ProviderAsset[]): Promise<CoingeckoPrices> {
        const key: string | undefined = this.config.COINGECKO_API_KEY;
        if (key === undefined) {
            throw new ProviderError(FAILURE_STAGES.request, FAILURE_REASONS.rejected);
        }
        const ids: string = assets.map((asset: ProviderAsset): string => encodeURIComponent(asset.externalId)).join(',');
        const url: string = `${this.config.COINGECKO_BASE_URL}/simple/price?ids=${ids}&vs_currencies=usd&include_last_updated_at=true`;
        const body: unknown = await requestJson(url, { 'x-cg-demo-api-key': key }, this.config.MARKET_DATA_HTTP_TIMEOUT_MS);
        const parsed: z.SafeParseReturnType<unknown, CoingeckoPrices> = coingeckoPriceSchema.safeParse(body);
        if (!parsed.success) {
            throw ProviderError.formatInvalid();
        }
        return parsed.data;
    }

    private readPrices(assets: readonly ProviderAsset[], prices: CoingeckoPrices): ProviderBatchResult {
        const quotes: ProviderQuote[] = [];
        const failures: ProviderFailure[] = [];
        for (const asset of assets) {
            const quote: ProviderQuote | ProviderFailure = this.quoteOf(asset, prices[asset.externalId]);
            if ('price' in quote) {
                quotes.push(quote);
                continue;
            }
            failures.push(quote);
        }
        return { quotes, failures };
    }

    private quoteOf(asset: ProviderAsset, entry: CoingeckoPrices[string] | undefined): ProviderQuote | ProviderFailure {
        if (entry?.usd === undefined) {
            return failureOf(asset, FAILURE_STAGES.notFound, FAILURE_REASONS.symbolUnknown);
        }
        if (entry.last_updated_at === undefined) {
            return failureOf(asset, FAILURE_STAGES.parse, FAILURE_REASONS.formatInvalid);
        }
        return {
            assetId: asset.assetId,
            price: decimalStringOf(entry.usd),
            currency: 'USD',
            priceDate: DateUtil.localDateIn(UTC_TIMEZONE, new Date(entry.last_updated_at * 1000)),
            source: this.provider
        };
    }
}
