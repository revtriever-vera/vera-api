import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { z } from 'zod';
import { decimalStringOf } from '../../../shared/utils/decimal.util';
import { marketDataConfig } from '../config/market-data.config';
import { ProviderError } from '../domain/market-data.errors';
import { FAILURE_REASONS, FAILURE_STAGES, QUOTE_PROVIDER_IDS, QuoteProviderId } from '../domain/market-data.types';
import { ProviderAsset, ProviderQuote } from '../ports/quote-provider.port';
import { ProviderBudgetService } from '../services/provider-budget.service';
import { TwelveDataQuote, twelveDataQuoteSchema } from '../validation/market-data.schemas';
import { requestJson } from './provider-http';
import { SequentialQuoteDriver } from './sequential-quote.driver';

const MAX_BATCH: number = 8;
const NOT_FOUND_CODE: number = 404;
const RATE_LIMITED_CODE: number = 429;

function errorOfCode(code: number | undefined): ProviderError {
    if (code === NOT_FOUND_CODE) {
        return new ProviderError(FAILURE_STAGES.notFound, FAILURE_REASONS.symbolUnknown);
    }
    return code === RATE_LIMITED_CODE
        ? ProviderError.ofStatus(RATE_LIMITED_CODE)
        : new ProviderError(FAILURE_STAGES.request, FAILURE_REASONS.rejected);
}

@Injectable()
export class TwelveDataQuoteDriver extends SequentialQuoteDriver {
    public readonly provider: QuoteProviderId = QUOTE_PROVIDER_IDS.twelvedata;
    public readonly maxBatchSize: number = MAX_BATCH;

    public constructor(
        @Inject(marketDataConfig.KEY) private readonly config: ConfigType<typeof marketDataConfig>,
        budget: ProviderBudgetService
    ) {
        super(budget);
    }

    protected async fetchOne(asset: ProviderAsset): Promise<ProviderQuote> {
        const key: string | undefined = this.config.TWELVEDATA_API_KEY;
        if (key === undefined) {
            throw new ProviderError(FAILURE_STAGES.request, FAILURE_REASONS.rejected);
        }
        const url: string = `${this.config.TWELVEDATA_BASE_URL}/quote?symbol=${encodeURIComponent(asset.externalId)}`;
        const body: unknown = await requestJson(url, { Authorization: `apikey ${key}` }, this.config.MARKET_DATA_HTTP_TIMEOUT_MS);
        const parsed: z.SafeParseReturnType<unknown, TwelveDataQuote> = twelveDataQuoteSchema.safeParse(body);
        if (!parsed.success) {
            throw ProviderError.formatInvalid();
        }
        if (parsed.data.status === 'error') {
            throw errorOfCode(parsed.data.code);
        }
        return {
            assetId: asset.assetId,
            price: decimalStringOf(parsed.data.close),
            currency: asset.currency,
            priceDate: parsed.data.datetime.slice(0, 10),
            source: this.provider
        };
    }
}
