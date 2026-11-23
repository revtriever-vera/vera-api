import { Injectable } from '@nestjs/common';
import { MetricsService } from '../../../core/observability/metrics.service';

const SEARCH_TOTAL: string = 'vera_issuer_search_total';

@Injectable()
export class IssuersMetricsService {
    public constructor(private readonly metrics: MetricsService) {}

    public search(kind: string): void {
        this.metrics.count(SEARCH_TOTAL, { kind });
    }
}
