import { Injectable } from '@nestjs/common';
import { LogService } from '../../../core/observability/log.service';
import { AiConsentSource, AiPayloadKind } from '../domain/ai-assistant.types';
import { AnswerCheck } from '../domain/ask-answer-guard';
import { GuardCheck } from '../domain/summary-guard';
import { SummaryKind, SummarySourceKind } from '../domain/summary.types';

const CONSENT_IDENTIFIER: string = 'ai-consent';
const PAYLOAD_IDENTIFIER: string = 'ai-payload';
const SUMMARY_IDENTIFIER: string = 'ai-summary';
const ASK_IDENTIFIER: string = 'ask-vera';

export interface AskAnsweredMeta {
    readonly source: string;
    readonly steps: number;
    readonly toolsUsed: readonly string[];
    readonly truncated: boolean;
    readonly proposals: number;
    readonly costMicros: number;
}

@Injectable()
export class AiAssistantLogService {
    public constructor(private readonly logService: LogService) {}

    public granted(noticeVersion: number, source: AiConsentSource): void {
        this.logService.info({ message: 'ai consent granted', identifier: CONSENT_IDENTIFIER, meta: { noticeVersion, source } });
    }

    public revoked(purged: number): void {
        this.logService.info({ message: 'ai consent revoked', identifier: CONSENT_IDENTIFIER, meta: { purged } });
    }

    public payloadBuilt(kind: AiPayloadKind, bytes: number): void {
        this.logService.debug({ message: 'ai payload built', identifier: PAYLOAD_IDENTIFIER, meta: { kind, bytes } });
    }

    public summaryServed(kind: SummaryKind, cached: boolean, source: SummarySourceKind): void {
        this.logService.info({
            message: 'ai summary served',
            identifier: SUMMARY_IDENTIFIER,
            meta: { kind, cached, source, attempts: 0, costMicros: 0 }
        });
    }

    public summaryGenerated(kind: SummaryKind, source: SummarySourceKind, attempts: number, costMicros: number): void {
        this.logService.info({
            message: 'ai summary generated',
            identifier: SUMMARY_IDENTIFIER,
            meta: { kind, cached: false, source, attempts, costMicros }
        });
    }

    public summaryGuardFailed(kind: SummaryKind, check: GuardCheck, attempt: number): void {
        this.logService.warn({ message: 'ai summary check failed', identifier: SUMMARY_IDENTIFIER, meta: { kind, check, attempt } });
    }

    public askAnswered(meta: AskAnsweredMeta): void {
        this.logService.info({ message: 'ask vera answered', identifier: ASK_IDENTIFIER, meta: { ...meta } });
    }

    public askToolFailed(tool: string): void {
        this.logService.warn({ message: 'ask vera tool failed', identifier: ASK_IDENTIFIER, meta: { tool } });
    }

    public askCheckFailed(check: AnswerCheck): void {
        this.logService.warn({ message: 'ask vera check failed', identifier: ASK_IDENTIFIER, meta: { check } });
    }
}
