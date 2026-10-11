import { ProviderError } from '../domain/market-data.errors';
import { FAILURE_REASONS, FAILURE_STAGES, FailureStage } from '../domain/market-data.types';
import { ProviderAsset, ProviderBatchResult, ProviderFailure, ProviderQuote } from '../ports/quote-provider.port';

export function failureOf(asset: ProviderAsset, stage: FailureStage, reason: string): ProviderFailure {
    return { assetId: asset.assetId, stage, reason };
}

export function failuresFor(assets: readonly ProviderAsset[], error: unknown): ProviderFailure[] {
    const stage: FailureStage = error instanceof ProviderError ? error.stage : FAILURE_STAGES.request;
    const reason: string = error instanceof ProviderError ? error.reason : FAILURE_REASONS.unexpected;
    return assets.map((asset: ProviderAsset): ProviderFailure => failureOf(asset, stage, reason));
}

export function budgetFailures(assets: readonly ProviderAsset[]): ProviderFailure[] {
    return assets.map((asset: ProviderAsset): ProviderFailure => failureOf(asset, FAILURE_STAGES.budget, FAILURE_REASONS.budgetExhausted));
}

export function mergeResults(results: readonly ProviderBatchResult[]): ProviderBatchResult {
    return {
        quotes: results.flatMap((result: ProviderBatchResult): readonly ProviderQuote[] => result.quotes),
        failures: results.flatMap((result: ProviderBatchResult): readonly ProviderFailure[] => result.failures)
    };
}

export function chunksOf<T>(items: readonly T[], size: number): T[][] {
    return Array.from({ length: Math.ceil(items.length / size) }, (_unused: unknown, index: number) =>
        items.slice(index * size, (index + 1) * size)
    );
}
