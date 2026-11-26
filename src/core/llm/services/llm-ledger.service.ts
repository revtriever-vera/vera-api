import { Inject, Injectable, Optional } from '@nestjs/common';
import { LlmCallDomain } from '../domain/llm-call.domain';
import { isPlatformFeature, LlmFeature, LlmOutcome, LlmUsage, TenantLlmFeature } from '../llm.types';
import { NoopLlmUsageAdapter } from '../ports/noop-llm-usage.adapter';
import { LlmUsagePort } from '../ports/llm-usage.port';
import { LlmLogService } from './llm-log.service';
import { LlmMetricsService } from './llm-metrics.service';
import { LlmPlatformBudgetService } from './llm-platform-budget.service';

const BPS_FULL: number = 10_000;

export interface LlmLedgerEntry {
    readonly callId: string;
    readonly task: string;
    readonly feature: LlmFeature;
    readonly driver: string;
    readonly modelId: string;
    readonly servedModelId: string | null;
    readonly usage: LlmUsage;
    readonly costMicros: number;
    readonly gatewayCostMicros: number | null;
    readonly estimateMicros: number;
    readonly latencyMs: number;
    readonly attempts: number;
    readonly outcome: LlmOutcome;
    readonly requestHash: string;
    readonly referenceId: string | null;
    readonly outsideCap?: boolean;
}

@Injectable()
export class LlmLedgerService {
    private readonly usage: LlmUsagePort;

    public constructor(
        private readonly calls: LlmCallDomain,
        private readonly logs: LlmLogService,
        private readonly metrics: LlmMetricsService,
        private readonly platformBudget: LlmPlatformBudgetService,
        @Optional() @Inject(LlmUsagePort) usage: LlmUsagePort | null
    ) {
        this.usage = usage ?? new NoopLlmUsageAdapter();
    }

    public async assertRoom(feature: LlmFeature, task: string, estimateMicros: number): Promise<void> {
        if (isPlatformFeature(feature)) {
            await this.platformBudget.assertRoom(feature, estimateMicros);
            return;
        }
        await this.usage.assertRoom({ feature, task, estimateMicros });
    }

    public async answeredSince(requestHash: string, since: Date, feature: LlmFeature): Promise<number> {
        return this.calls.answeredSince(requestHash, since, feature);
    }

    public async record(entry: LlmLedgerEntry): Promise<void> {
        this.metrics.request(entry.task, entry.driver, entry.outcome);
        await this.guarded(entry.task, 'call', async () => {
            await this.calls.record({ ...entry, ...entry.usage });
        });
        if (entry.outcome === 'cap_reached') {
            this.logs.capReached(entry.task, entry.feature);
            return;
        }
        this.metrics.duration(entry.task, entry.driver, entry.latencyMs);
        this.metrics.tokens(entry.task, entry.usage);
        this.metrics.cost(entry.task, entry.feature, entry.costMicros);
        this.reportDivergence(entry);
        const feature: LlmFeature = entry.feature;
        if (entry.outsideCap === true || isPlatformFeature(feature)) {
            return;
        }
        await this.guarded(entry.task, 'usage', async () => this.recordUsage(entry, feature));
    }

    private async recordUsage(entry: LlmLedgerEntry, feature: TenantLlmFeature): Promise<void> {
        await this.usage.record({
            feature,
            task: entry.task,
            referenceId: entry.callId,
            costMicros: entry.costMicros,
            estimateMicros: entry.estimateMicros,
            outcome: entry.outcome === 'failed' ? 'unanswered' : 'answered',
            ...(entry.gatewayCostMicros === null ? {} : { providerCostMicros: entry.gatewayCostMicros }),
            detail: { model: entry.modelId, inputTokens: entry.usage.inputTokens, outputTokens: entry.usage.outputTokens }
        });
    }

    private reportDivergence(entry: LlmLedgerEntry): void {
        if (entry.gatewayCostMicros === null || entry.gatewayCostMicros === 0) {
            return;
        }
        const bps: number = Math.round((Math.abs(entry.costMicros - entry.gatewayCostMicros) * BPS_FULL) / entry.gatewayCostMicros);
        this.metrics.divergence(entry.task, bps);
    }

    private async guarded(task: string, step: string, work: () => Promise<void>): Promise<void> {
        try {
            await work();
        } catch (error: unknown) {
            this.logs.bookkeepingFailed(task, step, error);
        }
    }
}
