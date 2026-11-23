import { Injectable } from '@nestjs/common';
import { MetricsService } from '../../../core/observability/metrics.service';
import { AiConsentSource, AiPayloadKind } from '../domain/ai-assistant.types';

const CONSENT_TOTAL: string = 'vera_ai_consent_total';
const CONTEXT_BYTES: string = 'vera_ai_context_bytes';

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
}
