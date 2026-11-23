import { Injectable } from '@nestjs/common';
import { QueueEnvelope, QueueHandlerPort } from '../../../../core/queue/queue.types';
import { MESSAGE_TYPES, QUEUES, QueueName } from '../../../../shared/constants/queues.constants';
import { WebhookApplication } from '../../application/webhook.application';
import { InboundReceivedPayload } from '../../domain/whatsapp.types';
import { parseJob } from '../../validation/parse-job';
import { inboundReceivedSchema } from '../../validation/whatsapp-jobs.schemas';

@Injectable()
export class InboundMessageHandler extends QueueHandlerPort {
    public readonly queue: QueueName = QUEUES.whatsapp;
    public readonly type: string = MESSAGE_TYPES.whatsappInboundReceived;

    public constructor(private readonly application: WebhookApplication) {
        super();
    }

    public async handle(envelope: QueueEnvelope): Promise<void> {
        const payload: InboundReceivedPayload | null = parseJob(inboundReceivedSchema, envelope.payload);
        if (payload !== null) {
            await this.application.processInbound(payload.eventId, payload.wamid);
        }
    }
}
