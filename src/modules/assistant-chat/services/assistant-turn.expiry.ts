import { Injectable } from '@nestjs/common';
import { AssistantMessage, MESSAGE_STATUSES, TURN_TIMEOUT_MS, TurnMode } from '../domain/assistant-chat.types';
import { AssistantMessageDomain } from '../domain/assistant-message.domain';
import { modeOf } from '../domain/turn-view';
import { AssistantChatLogService } from './assistant-chat-log.service';
import { AssistantChatMetricsService, TURN_OUTCOMES } from './assistant-chat-metrics.service';

@Injectable()
export class AssistantTurnExpiry {
    public constructor(
        private readonly messages: AssistantMessageDomain,
        private readonly logs: AssistantChatLogService,
        private readonly metrics: AssistantChatMetricsService
    ) {}

    public async settled(message: AssistantMessage): Promise<AssistantMessage> {
        if (message.status !== MESSAGE_STATUSES.pending || Date.now() - message.createdAt.getTime() <= TURN_TIMEOUT_MS) {
            return message;
        }
        const mode: TurnMode = modeOf(message);
        if (await this.messages.fail(message.id, mode)) {
            this.logs.turnLost(message.id);
            this.metrics.turn(mode, TURN_OUTCOMES.failed);
        }
        return { ...message, status: MESSAGE_STATUSES.failed };
    }
}
