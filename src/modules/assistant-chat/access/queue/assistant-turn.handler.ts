import { Injectable } from '@nestjs/common';
import { QueueEnvelope, QueueHandlerPort } from '../../../../core/queue/queue.types';
import { MESSAGE_TYPES, QUEUES, QueueName } from '../../../../shared/constants/queues.constants';
import { AssistantAnswerApplication } from '../../application/assistant-answer.application';
import { parseJob } from '../../validation/parse-job';
import { TurnRequestedPayload, turnRequestedSchema } from '../../validation/assistant-chat-jobs.schemas';

@Injectable()
export class AssistantTurnRequestedHandler extends QueueHandlerPort {
    public readonly queue: QueueName = QUEUES.assistantChat;
    public readonly type: string = MESSAGE_TYPES.assistantTurnRequested;

    public constructor(private readonly application: AssistantAnswerApplication) {
        super();
    }

    public async handle(envelope: QueueEnvelope): Promise<void> {
        const payload: TurnRequestedPayload | null = parseJob(turnRequestedSchema, envelope.payload);
        if (payload !== null) {
            await this.application.run(payload);
        }
    }
}
