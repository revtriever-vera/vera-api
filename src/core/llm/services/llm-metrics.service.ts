import { Injectable } from '@nestjs/common';
import { MetricsService } from '../../observability/metrics.service';
import { LlmFeature, LlmUsage } from '../llm.types';

const REQUESTS: string = 'vera_llm_requests_total';
const TOKENS: string = 'vera_llm_tokens_total';
const COST: string = 'vera_llm_cost_micros_total';
const DURATION: string = 'vera_llm_request_duration_ms';
const DIVERGENCE: string = 'vera_llm_cost_divergence_bps';

@Injectable()
export class LlmMetricsService {
    public constructor(private readonly metrics: MetricsService) {}

    public request(task: string, driver: string, outcome: string): void {
        this.metrics.count(REQUESTS, { task, driver, outcome });
    }

    public tokens(task: string, usage: LlmUsage): void {
        this.metrics.count(TOKENS, { task, kind: 'input' }, usage.inputTokens);
        this.metrics.count(TOKENS, { task, kind: 'output' }, usage.outputTokens);
        this.metrics.count(TOKENS, { task, kind: 'cache_read' }, usage.cacheReadTokens);
    }

    public cost(task: string, feature: LlmFeature, costMicros: number): void {
        this.metrics.count(COST, { task, feature }, costMicros);
    }

    public duration(task: string, driver: string, latencyMs: number): void {
        this.metrics.observe(DURATION, latencyMs, { task, driver });
    }

    public divergence(task: string, bps: number): void {
        this.metrics.observe(DIVERGENCE, bps, { task });
    }
}
