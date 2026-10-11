import { Injectable } from '@nestjs/common';
import { AssetQuoteDomain } from '../domain/asset-quote.domain';
import { QuoteFetchFailureDomain } from '../domain/quote-fetch-failure.domain';
import { FETCH_RESULTS, FailureWrite, QuotableAsset, QuoteGroup, QuoteMarket, QuoteRecord } from '../domain/market-data.types';
import { expectedPriceDate } from '../domain/quote-staleness';
import { ProviderAsset, ProviderBatchResult, ProviderFailure, QuoteProviderPort } from '../ports/quote-provider.port';
import { MarketDataLogService } from './market-data-log.service';
import { MarketDataMetricsService } from './market-data-metrics.service';
import { QuoteProviderRegistryService } from './quote-provider-registry.service';

export interface CollectOutcome {
    readonly requested: number;
    readonly stored: number;
    readonly failed: number;
}

interface Attempt {
    readonly stored: number;
    readonly failures: ProviderFailure[];
}

export function toProviderAsset(asset: QuotableAsset): ProviderAsset {
    return {
        assetId: asset.id,
        market: asset.market as QuoteMarket,
        externalId: asset.externalId,
        symbol: asset.symbol,
        currency: asset.currency
    };
}

@Injectable()
export class QuoteCollectorService {
    public constructor(
        private readonly registry: QuoteProviderRegistryService,
        private readonly quotes: AssetQuoteDomain,
        private readonly failures: QuoteFetchFailureDomain,
        private readonly logs: MarketDataLogService,
        private readonly metrics: MarketDataMetricsService
    ) {}

    public async collect(group: QuoteGroup, assets: readonly QuotableAsset[], now: Date = new Date()): Promise<CollectOutcome> {
        const chain: QuoteProviderPort[] = this.registry.chainFor(group);
        if (chain.length === 0) {
            this.logs.groupWithoutProvider(group);
            return { requested: assets.length, stored: 0, failed: assets.length };
        }
        const due: ProviderAsset[] = await this.dueAssets(assets, now);
        const outcome: CollectOutcome = await this.walkChain(chain, due);
        this.logs.chunkFinished(group, due.length, outcome.stored, outcome.failed);
        return outcome;
    }

    private async walkChain(chain: readonly QuoteProviderPort[], due: readonly ProviderAsset[]): Promise<CollectOutcome> {
        let pending: ProviderAsset[] = [...due];
        let stored: number = 0;
        let lastFailures: ProviderFailure[] = [];
        let lastProvider: QuoteProviderPort | undefined;
        for (const port of chain) {
            if (pending.length === 0) {
                break;
            }
            const attempt: Attempt = await this.attempt(port, pending);
            stored += attempt.stored;
            pending = this.stillFailing(pending, attempt.failures);
            lastFailures = attempt.failures;
            lastProvider = port;
        }
        await this.recordFailures(lastProvider, lastFailures);
        return { requested: due.length, stored, failed: pending.length };
    }

    private stillFailing(pending: readonly ProviderAsset[], failures: readonly ProviderFailure[]): ProviderAsset[] {
        const failedIds: ReadonlySet<string> = new Set<string>(failures.map((failure: ProviderFailure): string => failure.assetId));
        return pending.filter((asset: ProviderAsset): boolean => failedIds.has(asset.assetId));
    }

    private async attempt(port: QuoteProviderPort, assets: readonly ProviderAsset[]): Promise<Attempt> {
        const result: ProviderBatchResult = await port.fetchBatch(assets);
        if (result.quotes.length > 0) {
            await this.quotes.save(result.quotes, new Date());
            await this.failures.resolveForAssets(result.quotes.map((quote): string => quote.assetId));
        }
        this.metrics.fetched(port.provider, FETCH_RESULTS.ok, result.quotes.length);
        this.metrics.fetched(port.provider, FETCH_RESULTS.failed, result.failures.length);
        this.logDistinctFailures(port, result.failures);
        return { stored: result.quotes.length, failures: [...result.failures] };
    }

    private logDistinctFailures(port: QuoteProviderPort, failures: readonly ProviderFailure[]): void {
        const distinct: Set<string> = new Set<string>(
            failures.map((failure: ProviderFailure): string => `${failure.stage}|${failure.reason}`)
        );
        for (const entry of distinct) {
            const [stage, reason] = entry.split('|');
            this.logs.providerFailed(port.provider, stage ?? '', reason ?? '');
        }
    }

    private async recordFailures(port: QuoteProviderPort | undefined, failures: readonly ProviderFailure[]): Promise<void> {
        if (port === undefined) {
            return;
        }
        await this.failures.record(
            failures.map((failure: ProviderFailure): FailureWrite => ({
                assetId: failure.assetId,
                provider: port.provider,
                stage: failure.stage,
                reason: failure.reason
            }))
        );
    }

    private async dueAssets(assets: readonly QuotableAsset[], now: Date): Promise<ProviderAsset[]> {
        const stored: QuoteRecord[] = await this.quotes.findByAssetIds(assets.map((asset: QuotableAsset): string => asset.id));
        const dateByAsset: ReadonlyMap<string, string> = new Map<string, string>(
            stored.map((record: QuoteRecord): [string, string] => [record.assetId, record.priceDate])
        );
        return assets
            .map(toProviderAsset)
            .filter((asset: ProviderAsset): boolean => (dateByAsset.get(asset.assetId) ?? '') < expectedPriceDate(asset.market, now));
    }
}
