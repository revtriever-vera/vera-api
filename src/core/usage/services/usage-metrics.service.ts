import { Injectable } from '@nestjs/common';
import { MetricsService } from '../../observability/metrics.service';
import { UsageFeature, UsageStateKey } from '../usage.types';

const COST_TOTAL: string = 'vera_paid_usage_cost_micros_total';
const CAP_REACHED_TOTAL: string = 'vera_paid_usage_cap_reached_total';
const COMPANIES: string = 'vera_paid_usage_companies';
const OVERSHOOT: string = 'vera_paid_usage_overshoot_micros';

@Injectable()
export class UsageMetricsService {
    public constructor(private readonly metrics: MetricsService) {}

    public cost(feature: UsageFeature, task: string, costMicros: number): void {
        this.metrics.count(COST_TOTAL, { feature, task }, costMicros);
    }

    public capReached(feature: UsageFeature): void {
        this.metrics.count(CAP_REACHED_TOTAL, { feature });
    }

    public companies(state: UsageStateKey, total: number): void {
        this.metrics.gauge(COMPANIES, total, { state });
    }

    public overshoot(micros: number): void {
        this.metrics.observe(OVERSHOOT, micros);
    }
}
