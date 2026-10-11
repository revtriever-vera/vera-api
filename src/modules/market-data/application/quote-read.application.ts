import { Injectable } from '@nestjs/common';
import { ExchangeRateUnavailableError } from '../domain/market-data.errors';
import { LatestQuotes, StoredRate } from '../domain/market-data.types';
import { ExchangeRateReaderService } from '../services/exchange-rate-reader.service';
import { QuoteReaderService } from '../services/quote-reader.service';
import { ExchangeRateResponse, QuotesResponse } from '../validation/market-data.schemas';

@Injectable()
export class QuoteReadApplication {
    public constructor(
        private readonly quotes: QuoteReaderService,
        private readonly rates: ExchangeRateReaderService
    ) {}

    public async quotesOf(assetIds: readonly string[]): Promise<QuotesResponse> {
        const latest: LatestQuotes = await this.quotes.getLatestWithPending(assetIds);
        return { quotes: [...latest.quotes.values()], pendingAssetIds: [...latest.pendingAssetIds] };
    }

    public async exchangeRateOf(currency: string): Promise<ExchangeRateResponse> {
        const rate: StoredRate | null = await this.rates.latest(currency, new Date());
        if (rate === null) {
            throw new ExchangeRateUnavailableError(currency);
        }
        return rate;
    }
}
