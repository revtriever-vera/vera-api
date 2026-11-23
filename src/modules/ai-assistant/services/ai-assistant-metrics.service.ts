import { Injectable } from '@nestjs/common';
import { MetricsService } from '../../../core/observability/metrics.service';
import { AiConsentSource, AiPayloadKind } from '../domain/ai-assistant.types';
import { GuardCheck } from '../domain/summary-guard';
import { SummaryKind } from '../domain/summary.types';

const CONSENT_TOTAL: string = 'vera_ai_consent_total';
const CONTEXT_BYTES: string = 'vera_ai_context_bytes';
const SUMMARIES_TOTAL: string = 'vera_ai_summaries_total';
const GUARD_FAILURES_TOTAL: string = 'vera_ai_summary_guard_failures_total';
const REGENERATIONS_TOTAL: string = 'vera_ai_summary_regenerations_total';

export type SummaryOutcome = 'cached' | 'generated' | 'fixed' | 'invalid' | 'cap_reached';

@Injectable()
export class AiAssistantMetricsService {
    public constructor(private readonly metrics: MetricsService) {}

    public consentGranted(source: AiConsentSource): void {
        this.metrics.count(CONSENT_TOTAL, { action: 'granted', source });
    }

    public consentRevoked(): void {
        this.metrics.count(CONSENT_TOTAL, { action: 'revoked', source: 'none' });
    }

    public contextBytes(kind: AiPayloadKind, bytes: number): void {
        this.metrics.observe(CONTEXT_BYTES, bytes, { kind });
    }

    public summary(kind: SummaryKind, outcome: SummaryOutcome): void {
        this.metrics.count(SUMMARIES_TOTAL, { kind, outcome });
    }

    public summaryGuardFailure(kind: SummaryKind, check: GuardCheck): void {
        this.metrics.count(GUARD_FAILURES_TOTAL, { kind, check });
    }

    public summaryRegeneration(kind: SummaryKind): void {
        this.metrics.count(REGENERATIONS_TOTAL, { kind });
    }
}
