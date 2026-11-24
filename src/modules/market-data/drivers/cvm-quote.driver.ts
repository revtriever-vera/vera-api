import { Injectable } from '@nestjs/common';
import { CvmDailyInformeReaderService, DailyQuote } from '../../catalog/services/cvm-daily-informe-reader.service';
import { informeMonthsOf } from '../domain/cvm-informe-months';
import { FAILURE_REASONS, FAILURE_STAGES, QUOTE_PROVIDER_IDS, QuoteProviderId } from '../domain/market-data.types';
import { ProviderAsset, ProviderBatchResult, ProviderFailure, ProviderQuote, QuoteProviderPort } from '../ports/quote-provider.port';
import { failureOf, failuresFor } from './provider-batch';

const MAX_BATCH: number = 100_000;

@Injectable()
export class CvmQuoteDriver extends QuoteProviderPort {
    public readonly provider: QuoteProviderId = QUOTE_PROVIDER_IDS.cvm;
    public readonly maxBatchSize: number = MAX_BATCH;

    public constructor(private readonly reader: CvmDailyInformeReaderService) {
        super();
    }

    public async fetchBatch(assets: readonly ProviderAsset[]): Promise<ProviderBatchResult> {
        try {
            const keys: ReadonlySet<string> = new Set<string>(assets.map((asset: ProviderAsset): string => asset.externalId));
            const latest: ReadonlyMap<string, DailyQuote> = await this.reader.latestQuotes(informeMonthsOf(new Date()), keys);
            return this.resultOf(assets, latest);
        } catch (error: unknown) {
            return { quotes: [], failures: failuresFor(assets, error) };
        }
    }

    private resultOf(assets: readonly ProviderAsset[], latest: ReadonlyMap<string, DailyQuote>): ProviderBatchResult {
        const quotes: ProviderQuote[] = [];
        const failures: ProviderFailure[] = [];
        for (const asset of assets) {
            const found: DailyQuote | undefined = latest.get(asset.externalId);
            if (found === undefined) {
                failures.push(failureOf(asset, FAILURE_STAGES.notFound, FAILURE_REASONS.symbolUnknown));
                continue;
            }
            quotes.push({ assetId: asset.assetId, price: found.quota, currency: 'BRL', priceDate: found.date, source: this.provider });
        }
        return { quotes, failures };
    }
}
