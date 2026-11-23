import { Injectable } from '@nestjs/common';
import { PaidUsageMeter } from '../../../core/usage/services/paid-usage-meter.service';
import { UsageState } from '../../../core/usage/usage.types';
import { AiConsentService } from '../../ai-assistant/services/ai-consent.service';
import { PlanGateService } from '../../plans/services/plan-gate.service';
import type { InboundMessage } from '../../whatsapp/services/inbound-dispatch.port';
import { RouterFacts } from '../domain/conversation-router';
import { ChatExtensionsRegistry } from './chat-extensions.registry';
import { PendingActionService } from './pending-action.service';

@Injectable()
export class ChatFactsService {
    public constructor(
        private readonly gate: PlanGateService,
        private readonly consent: AiConsentService,
        private readonly meter: PaidUsageMeter,
        private readonly pending: PendingActionService,
        private readonly registry: ChatExtensionsRegistry
    ) {}

    public async of(message: InboundMessage, linkId: string): Promise<RouterFacts> {
        return {
            kind: message.kind,
            text: message.text ?? '',
            pendingOpen: await this.pending.hasOpen(linkId),
            remindersAvailable: this.registry.reminders() !== null,
            gate: await this.gate.stateOf('whatsapp'),
            consentGranted: await this.consent.isGranted()
        };
    }

    public async resetsAt(): Promise<string | null> {
        const state: UsageState = await this.meter.state();
        return state.resetsAt;
    }
}
