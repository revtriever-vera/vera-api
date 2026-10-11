import { Injectable } from '@nestjs/common';
import { MetricsService } from '../../../core/observability/metrics.service';
import { BudgetWindow } from '../domain/market-data.types';

const FETCH_TOTAL: string = 'vera_quotes_fetch_total';
const STALE_ASSETS: string = 'vera_quotes_stale_assets';
const BUDGET_RATIO: string = 'vera_provider_budget_used_ratio';
const RATE_AGE: string = 'vera_exchange_rate_age_days';

@Injectable()
export class MarketDataMetricsService {
    public constructor(private readonly metrics: MetricsService) {}

    public fetched(provider: string, result: string, amount: number): void {
        if (amount > 0) {
            this.metrics.count(FETCH_TOTAL, { provider, result }, amount);
        }
    }

    public staleAssets(total: number): void {
        this.metrics.gauge(STALE_ASSETS, total);
    }

    public budgetUsed(provider: string, window: BudgetWindow, ratio: number): void {
        this.metrics.gauge(BUDGET_RATIO, ratio, { provider, window });
    }

    public rateAge(currency: string, days: number): void {
        this.metrics.gauge(RATE_AGE, days, { currency });
    }
}
