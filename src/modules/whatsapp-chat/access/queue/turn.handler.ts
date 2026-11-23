import { Injectable } from '@nestjs/common';
import { QueueEnvelope, QueueHandlerPort } from '../../../../core/queue/queue.types';
import { MESSAGE_TYPES, QUEUES, QueueName } from '../../../../shared/constants/queues.constants';
import { parseJob } from '../../validation/parse-job';
import { TurnApplication } from '../../application/turn.application';
import { TurnRequestedPayload, turnRequestedSchema } from '../../validation/whatsapp-chat-jobs.schemas';

@Injectable()
export class TurnRequestedHandler extends QueueHandlerPort {
    public readonly queue: QueueName = QUEUES.whatsapp;
    public readonly type: string = MESSAGE_TYPES.whatsappTurnRequested;

    public constructor(private readonly application: TurnApplication) {
        super();
    }

    public async handle(envelope: QueueEnvelope): Promise<void> {
        const payload: TurnRequestedPayload | null = parseJob(turnRequestedSchema, envelope.payload);
        if (payload !== null) {
            await this.application.run(payload);
        }
    }
}
