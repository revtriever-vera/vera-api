import { Injectable } from '@nestjs/common';
import { QueueEnvelope, QueueHandlerPort } from '../../../../core/queue/queue.types';
import { MESSAGE_TYPES, QUEUES, QueueName } from '../../../../shared/constants/queues.constants';
import { parseJob } from '../../validation/parse-job';
import { AnswerApplication } from '../../application/answer.application';
import { TurnAnsweredPayload, turnAnsweredSchema } from '../../validation/whatsapp-chat-jobs.schemas';

@Injectable()
export class TurnAnsweredHandler extends QueueHandlerPort {
    public readonly queue: QueueName = QUEUES.whatsapp;
    public readonly type: string = MESSAGE_TYPES.whatsappTurnAnswered;

    public constructor(private readonly application: AnswerApplication) {
        super();
    }

    public async handle(envelope: QueueEnvelope): Promise<void> {
        const payload: TurnAnsweredPayload | null = parseJob(turnAnsweredSchema, envelope.payload);
        if (payload !== null) {
            await this.application.deliver(payload);
        }
    }
}
