import { Injectable } from '@nestjs/common';
import { LlmProviderDisabledError } from '../../../core/llm/llm.errors';
import { LlmAvailabilityService } from '../../../core/llm/services/llm-availability.service';
import { PlanGateService } from '../../plans/services/plan-gate.service';
import { AskRoute } from '../domain/ask-channel-profiles';
import { AI_FEATURE } from '../domain/ai-assistant.types';
import { AiConsentService } from './ai-consent.service';

@Injectable()
export class AskVeraAccessService {
    public constructor(
        private readonly gate: PlanGateService,
        private readonly consent: AiConsentService,
        private readonly availability: LlmAvailabilityService
    ) {}

    public async assertAllowed(route: AskRoute): Promise<void> {
        if (route.feature === 'help') {
            await this.assertModelAvailable();
            return;
        }
        await this.gate.assert(route.feature === 'whatsapp' ? 'whatsapp' : AI_FEATURE);
        await this.consent.assertGranted();
    }

    private async assertModelAvailable(): Promise<void> {
        if (!(await this.availability.enabled())) {
            throw new LlmProviderDisabledError();
        }
    }
}
