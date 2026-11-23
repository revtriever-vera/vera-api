import { Injectable } from '@nestjs/common';
import { LlmAvailabilityService } from '../../../core/llm/services/llm-availability.service';
import { AI_FEATURE } from '../domain/ai-assistant.types';
import { PaidFeatureAvailabilityPort } from '../../plans/services/paid-feature-availability.port';

@Injectable()
export class AiFeatureAvailability extends PaidFeatureAvailabilityPort {
    public readonly feature: typeof AI_FEATURE = AI_FEATURE;

    public constructor(private readonly llm: LlmAvailabilityService) {
        super();
    }

    public async enabled(): Promise<boolean> {
        return this.llm.enabled();
    }
}
