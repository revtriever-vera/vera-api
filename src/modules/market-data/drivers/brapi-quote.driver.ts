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
import { BrapiResponse, brapiResponseSchema } from '../validation/market-data.schemas';
import { budgetFailures, chunksOf, failureOf, failuresFor, mergeResults } from './provider-batch';
import { requestJson } from './provider-http';

const MAX_BATCH: number = 20;
type BrapiResult = BrapiResponse['results'][number];

@Injectable()
export class BrapiQuoteDriver extends QuoteProviderPort {
    public readonly provider: QuoteProviderId = QUOTE_PROVIDER_IDS.brapi;
    public readonly maxBatchSize: number = MAX_BATCH;

    public constructor(
        @Inject(marketDataConfig.KEY) private readonly config: ConfigType<typeof marketDataConfig>,
        private readonly budget: ProviderBudgetService
    ) {
        super();
    }

    public async fetchBatch(assets: readonly ProviderAsset[]): Promise<ProviderBatchResult> {
        const results: ProviderBatchResult[] = [];
        const groups: ProviderAsset[][] = chunksOf(assets, this.config.BRAPI_MAX_TICKERS_PER_REQUEST);
        for (const [index, group] of groups.entries()) {
            if (!(await this.budget.reserve(this.provider, 1))) {
                results.push({ quotes: [], failures: budgetFailures(groups.slice(index).flat()) });
                break;
            }
            results.push(await this.request(group));
        }
        return mergeResults(results);
    }

    private async request(group: readonly ProviderAsset[]): Promise<ProviderBatchResult> {
        try {
            return this.readResults(group, await this.call(group));
        } catch (error: unknown) {
            return { quotes: [], failures: failuresFor(group, error) };
        }
    }

    private async call(group: readonly ProviderAsset[]): Promise<BrapiResponse> {
        const token: string | undefined = this.config.BRAPI_TOKEN;
        if (token === undefined) {
            throw new ProviderError(FAILURE_STAGES.request, FAILURE_REASONS.rejected);
        }
        const tickers: string = group.map((asset: ProviderAsset): string => encodeURIComponent(asset.externalId)).join(',');
        const body: unknown = await requestJson(
            `${this.config.BRAPI_BASE_URL}/quote/${tickers}`,
            { Authorization: `Bearer ${token}` },
            this.config.MARKET_DATA_HTTP_TIMEOUT_MS
        );
        const parsed: z.SafeParseReturnType<unknown, BrapiResponse> = brapiResponseSchema.safeParse(body);
        if (!parsed.success) {
            throw ProviderError.formatInvalid();
        }
        return parsed.data;
    }

    private readResults(group: readonly ProviderAsset[], response: BrapiResponse): ProviderBatchResult {
        const bySymbol: Map<string, BrapiResult> = new Map<string, BrapiResult>(
            response.results.map((result: BrapiResult): [string, BrapiResult] => [result.symbol.toUpperCase(), result])
        );
        const quotes: ProviderQuote[] = [];
        const failures: ProviderFailure[] = [];
        for (const asset of group) {
            const quote: ProviderQuote | ProviderFailure = this.quoteOf(asset, bySymbol.get(asset.externalId.toUpperCase()));
            if ('price' in quote) {
                quotes.push(quote);
                continue;
            }
            failures.push(quote);
        }
        return { quotes, failures };
    }

    private quoteOf(asset: ProviderAsset, result: BrapiResult | undefined): ProviderQuote | ProviderFailure {
        if (result?.regularMarketPrice === undefined || result.regularMarketPrice === null) {
            return failureOf(asset, FAILURE_STAGES.notFound, FAILURE_REASONS.symbolUnknown);
        }
        const traded: Date = new Date(result.regularMarketTime ?? Number.NaN);
        if (Number.isNaN(traded.getTime())) {
            return failureOf(asset, FAILURE_STAGES.parse, FAILURE_REASONS.formatInvalid);
        }
        return {
            assetId: asset.assetId,
            price: decimalStringOf(result.regularMarketPrice),
            currency: asset.currency,
            priceDate: DateUtil.localDateIn(DateUtil.BRAZIL_TIMEZONE, traded),
            source: this.provider
        };
    }
}
