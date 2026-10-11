import { ProviderBudgetService } from '../services/provider-budget.service';
import { ProviderAsset, ProviderBatchResult, ProviderFailure, ProviderQuote, QuoteProviderPort } from '../ports/quote-provider.port';
import { budgetFailures, failuresFor } from './provider-batch';

export abstract class SequentialQuoteDriver extends QuoteProviderPort {
    public constructor(protected readonly budget: ProviderBudgetService) {
        super();
    }

    public async fetchBatch(assets: readonly ProviderAsset[]): Promise<ProviderBatchResult> {
        const quotes: ProviderQuote[] = [];
        const failures: ProviderFailure[] = [];
        for (const [index, asset] of assets.entries()) {
            if (!(await this.budget.reserve(this.provider, 1))) {
                failures.push(...budgetFailures(assets.slice(index)));
                break;
            }
            await this.attempt(asset, quotes, failures);
        }
        return { quotes, failures };
    }

    protected abstract fetchOne(asset: ProviderAsset): Promise<ProviderQuote>;

    private async attempt(asset: ProviderAsset, quotes: ProviderQuote[], failures: ProviderFailure[]): Promise<void> {
        try {
            quotes.push(await this.fetchOne(asset));
        } catch (error: unknown) {
            failures.push(...failuresFor([asset], error));
        }
    }
}
