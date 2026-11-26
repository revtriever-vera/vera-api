import { Injectable } from '@nestjs/common';
import { MetricsService } from '../../../core/observability/metrics.service';

const COLLECTED_TOTAL: string = 'vera_market_documents_collected_total';
const SOURCE_FAILURES_TOTAL: string = 'vera_market_documents_source_failures_total';
const EXTRACTED_TOTAL: string = 'vera_market_documents_extracted_total';
const UNLINKED_ASSETS: string = 'vera_market_documents_unlinked_assets';

@Injectable()
export class MarketDocumentsMetricsService {
    public constructor(private readonly metrics: MetricsService) {}

    public collected(source: string, amount: number): void {
        if (amount > 0) {
            this.metrics.count(COLLECTED_TOTAL, { source }, amount);
        }
    }

    public sourceFailed(source: string, reason: string): void {
        this.metrics.count(SOURCE_FAILURES_TOTAL, { source, reason });
    }

    public extracted(outcome: string): void {
        this.metrics.count(EXTRACTED_TOTAL, { outcome });
    }

    public unlinkedAssets(total: number): void {
        this.metrics.gauge(UNLINKED_ASSETS, total);
    }
}
