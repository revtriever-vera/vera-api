import { Injectable } from '@nestjs/common';
import { QueueEnvelope, QueueHandlerPort } from '../../../../core/queue/queue.types';
import { MESSAGE_TYPES, QUEUES, QueueName } from '../../../../shared/constants/queues.constants';
import { WebhookApplication } from '../../application/webhook.application';
import { StatusReceivedPayload } from '../../domain/whatsapp.types';
import { parseJob } from '../../validation/parse-job';
import { statusReceivedSchema } from '../../validation/whatsapp-jobs.schemas';

@Injectable()
export class MessageStatusHandler extends QueueHandlerPort {
    public readonly queue: QueueName = QUEUES.whatsapp;
    public readonly type: string = MESSAGE_TYPES.whatsappStatusReceived;

    public constructor(private readonly application: WebhookApplication) {
        super();
    }

    public async handle(envelope: QueueEnvelope): Promise<void> {
        const payload: StatusReceivedPayload | null = parseJob(statusReceivedSchema, envelope.payload);
        if (payload !== null) {
            await this.application.processStatus(payload.eventId, payload.wamid, payload.status);
        }
    }
}
