import { Injectable } from '@nestjs/common';
import { MetricsService } from '../../../core/observability/metrics.service';
import { BillingOperation, BillingOutcome } from '../domain/billing-engine.types';

const REQUESTS_TOTAL: string = 'vera_billing_engine_requests_total';
const DURATION_MS: string = 'vera_billing_engine_duration_ms';

@Injectable()
export class BillingMetricsService {
    public constructor(private readonly metrics: MetricsService) {}

    public engineCall(operation: BillingOperation, outcome: BillingOutcome, durationMs: number): void {
        this.metrics.count(REQUESTS_TOTAL, { operation, outcome });
        this.metrics.observe(DURATION_MS, durationMs, { operation });
    }
}
