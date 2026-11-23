import { Injectable } from '@nestjs/common';
import { MetricsService } from '../../../core/observability/metrics.service';
import { FgcEndpoint } from '../domain/fgc.types';

const REQUESTS_TOTAL: string = 'vera_fgc_requests_total';
const OVER_LIMIT_GROUPS: string = 'vera_fgc_over_limit_groups';

@Injectable()
export class FgcMetricsService {
    public constructor(private readonly metrics: MetricsService) {}

    public request(endpoint: FgcEndpoint): void {
        this.metrics.count(REQUESTS_TOTAL, { endpoint });
    }

    public overLimitGroups(count: number): void {
        this.metrics.observe(OVER_LIMIT_GROUPS, count);
    }
}
