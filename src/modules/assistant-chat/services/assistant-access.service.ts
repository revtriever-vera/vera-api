import { Injectable } from '@nestjs/common';
import { LlmProviderDisabledError } from '../../../core/llm/llm.errors';
import { LlmAvailabilityService } from '../../../core/llm/services/llm-availability.service';
import { PaidUsageMeter } from '../../../core/usage/services/paid-usage-meter.service';
import { CapReachedError } from '../../../core/usage/usage.errors';
import { USAGE_STATES, UsageState } from '../../../core/usage/usage.types';
import { AiConsentService } from '../../ai-assistant/services/ai-consent.service';
import { PlanGateService } from '../../plans/services/plan-gate.service';
import { ACCESS_STATES, AccessState, TURN_MODES, TurnMode } from '../domain/assistant-chat.types';
import { usageViewOf } from '../domain/turn-view';
import type { UsageView } from '../validation/assistant-chat.schemas';

@Injectable()
export class AssistantAccessService {
    public constructor(
        private readonly gate: PlanGateService,
        private readonly consent: AiConsentService,
        private readonly availability: LlmAvailabilityService,
        private readonly meter: PaidUsageMeter
    ) {}

    public async modeOf(): Promise<TurnMode> {
        const allowed: boolean = (await this.gate.allows('ai')) && (await this.consent.isGranted());
        return allowed ? TURN_MODES.ai : TURN_MODES.help;
    }

    public async lockOf(): Promise<AccessState> {
        if (!(await this.gate.allows('ai'))) {
            return ACCESS_STATES.premiumRequired;
        }
        return (await this.consent.isGranted()) ? ACCESS_STATES.ok : ACCESS_STATES.permissionRequired;
    }

    public async assertCanAsk(mode: TurnMode): Promise<void> {
        if (!(await this.availability.enabled())) {
            throw new LlmProviderDisabledError();
        }
        const state: UsageState = await this.meter.state();
        if (usageViewOf(state, mode).state === USAGE_STATES.paused) {
            throw new CapReachedError(mode === TURN_MODES.help ? 'help' : 'ai', state.resetsAt);
        }
    }

    public async usageOf(mode: TurnMode): Promise<UsageView> {
        return usageViewOf(await this.meter.state(), mode);
    }
}
