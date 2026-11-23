import { Injectable } from '@nestjs/common';
import { HolderFilterKind } from '../../../shared/holder/holder-filter';
import { MetricsService } from '../../../core/observability/metrics.service';

const SNAPSHOT_DURATION: string = 'vera_portfolio_snapshot_duration_ms';
const HOLDER_FILTER_TOTAL: string = 'vera_portfolio_holder_filter_total';
const MISSING_QUOTES: string = 'vera_portfolio_missing_quotes_total';

@Injectable()
export class PortfolioMetricsService {
    public constructor(private readonly metrics: MetricsService) {}

    public snapshotDuration(durationMs: number): void {
        this.metrics.observe(SNAPSHOT_DURATION, durationMs);
    }

    public holderFilter(kind: HolderFilterKind): void {
        this.metrics.count(HOLDER_FILTER_TOTAL, { kind });
    }

    public missingQuotes(count: number): void {
        if (count > 0) {
            this.metrics.count(MISSING_QUOTES, {}, count);
        }
    }
}
