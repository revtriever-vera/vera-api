import { Injectable } from '@nestjs/common';
import { MetricsService } from '../../../core/observability/metrics.service';
import { BillingOperation, BillingOutcome } from '../domain/billing-engine.types';

const REQUESTS_TOTAL: string = 'vera_billing_engine_requests_total';
const DURATION_MS: string = 'vera_billing_engine_duration_ms';
const SUBSCRIPTIONS_TOTAL: string = 'vera_billing_subscriptions_total';
const EVENTS_TOTAL: string = 'vera_billing_events_total';
const PRICE_QUOTES_TOTAL: string = 'vera_billing_price_quotes_total';
const STANDING: string = 'vera_billing_standing';

@Injectable()
export class BillingMetricsService {
    public constructor(private readonly metrics: MetricsService) {}

    public engineCall(operation: BillingOperation, outcome: BillingOutcome, durationMs: number): void {
        this.metrics.count(REQUESTS_TOTAL, { operation, outcome });
        this.metrics.observe(DURATION_MS, durationMs, { operation });
    }

    public subscription(method: string, outcome: string): void {
        this.metrics.count(SUBSCRIPTIONS_TOTAL, { method, outcome });
    }

    public event(type: string, outcome: string): void {
        this.metrics.count(EVENTS_TOTAL, { type, outcome });
    }

    public priceQuote(outcome: string): void {
        this.metrics.count(PRICE_QUOTES_TOTAL, { outcome });
    }

    public standing(status: string, total: number): void {
        this.metrics.gauge(STANDING, total, { status });
    }
}
