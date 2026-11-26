import { Injectable } from '@nestjs/common';
import { FundQuoteHistoryService } from './fund-quote-history.service';
import { ProviderBudgetService } from './provider-budget.service';

@Injectable()
export class MarketDataPruneService {
    public constructor(
        private readonly budget: ProviderBudgetService,
        private readonly funds: FundQuoteHistoryService
    ) {}

    public async pruneAll(now: Date = new Date()): Promise<void> {
        await this.budget.pruneOldUsage(now);
        await this.funds.pruneHistory(now);
    }
}
