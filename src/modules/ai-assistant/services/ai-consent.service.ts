import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { AiConsent, AiConsentSource } from '../domain/ai-assistant.types';
import { AiConsentRequiredError } from '../domain/ai-assistant.errors';
import { AiConsentDomain } from '../domain/ai-consent.domain';
import { AI_NOTICE_VERSION } from '../domain/ai-notice';
import { AiAssistantLogService } from './ai-assistant-log.service';
import { AiAssistantMetricsService } from './ai-assistant-metrics.service';

export interface AcceptInput {
    readonly source: AiConsentSource;
}

export function isGrantedBy(consent: AiConsent | null): boolean {
    return consent !== null && consent.revokedAt === null && consent.noticeVersion === AI_NOTICE_VERSION;
}

@Injectable()
export class AiConsentService {
    public constructor(
        private readonly consents: AiConsentDomain,
        private readonly context: AppContext,
        private readonly logs: AiAssistantLogService,
        private readonly metrics: AiAssistantMetricsService
    ) {}

    public async current(): Promise<AiConsent | null> {
        return this.consents.current();
    }

    public async isGranted(): Promise<boolean> {
        return isGrantedBy(await this.consents.current());
    }

    public async assertGranted(): Promise<void> {
        if (!(await this.isGranted())) {
            throw new AiConsentRequiredError();
        }
    }

    public async accept(input: AcceptInput): Promise<void> {
        await this.consents.grant({
            noticeVersion: AI_NOTICE_VERSION,
            source: input.source,
            userId: this.context.get().userId ?? null
        });
        this.logs.granted(AI_NOTICE_VERSION, input.source);
        this.metrics.consentGranted(input.source);
    }
}
