import { Injectable } from '@nestjs/common';
import { PlanGateService } from '../../plans/services/plan-gate.service';
import { ASK_VERA_FEATURE } from '../domain/ask-vera.types';
import { AiConsentService } from './ai-consent.service';

@Injectable()
export class AskVeraAccessService {
    public constructor(
        private readonly gate: PlanGateService,
        private readonly consent: AiConsentService
    ) {}

    public async assertAllowed(): Promise<void> {
        await this.gate.assert(ASK_VERA_FEATURE);
        await this.consent.assertGranted();
    }
}
