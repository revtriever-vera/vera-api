import { Injectable } from '@nestjs/common';
import { QueuePublisherPort } from '../../../core/queue/queue.types';
import { MESSAGE_TYPES, QUEUES } from '../../../shared/constants/queues.constants';
import { TurnRequestedPayload } from '../validation/assistant-chat-jobs.schemas';
import { AssistantChatLogService } from './assistant-chat-log.service';

@Injectable()
export class AssistantTurnPublisher {
    public constructor(
        private readonly publisher: QueuePublisherPort,
        private readonly logs: AssistantChatLogService
    ) {}

    public async request(payload: TurnRequestedPayload): Promise<void> {
        try {
            await this.publisher.publish(QUEUES.assistantChat, MESSAGE_TYPES.assistantTurnRequested, payload, {
                jobId: `assistant-turn-${payload.turnId}`,
                attempts: 1
            });
        } catch (error: unknown) {
            this.logs.publishFailed(payload.turnId, error);
            throw error;
        }
    }
}
