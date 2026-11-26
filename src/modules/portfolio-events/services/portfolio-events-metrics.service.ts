import { Injectable } from '@nestjs/common';
import { MetricsService } from '../../../core/observability/metrics.service';

const FETCHED_TOTAL: string = 'vera_portfolio_events_fetched_total';
const UNLINKED_ASSETS: string = 'vera_portfolio_events_unlinked_assets';
const SOURCE_FAILURES_TOTAL: string = 'vera_portfolio_events_source_failures_total';

@Injectable()
export class PortfolioEventsMetricsService {
    public constructor(private readonly metrics: MetricsService) {}

    public fetched(source: string, kind: string, amount: number): void {
        if (amount > 0) {
            this.metrics.count(FETCHED_TOTAL, { source, kind }, amount);
        }
    }

    public unlinkedAssets(total: number): void {
        this.metrics.gauge(UNLINKED_ASSETS, total);
    }

    public sourceFailed(source: string, reason: string): void {
        this.metrics.count(SOURCE_FAILURES_TOTAL, { source, reason });
    }
}
