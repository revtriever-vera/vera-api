import { Injectable } from '@nestjs/common';
import { QueueEnvelope, QueueHandlerPort, RunningJob } from '../../../../core/queue/queue.types';
import { MESSAGE_TYPES, QUEUES, QueueName } from '../../../../shared/constants/queues.constants';
import { SendApplication } from '../../application/send.application';
import { SendRequestedPayload } from '../../domain/whatsapp.types';
import { parseJob } from '../../validation/parse-job';
import { sendRequestedSchema } from '../../validation/whatsapp-jobs.schemas';

@Injectable()
export class MessageSendHandler extends QueueHandlerPort {
    public readonly queue: QueueName = QUEUES.whatsapp;
    public readonly type: string = MESSAGE_TYPES.whatsappSendRequested;

    public constructor(private readonly application: SendApplication) {
        super();
    }

    public async handle(envelope: QueueEnvelope, job?: RunningJob): Promise<void> {
        const payload: SendRequestedPayload | null = parseJob(sendRequestedSchema, envelope.payload);
        if (payload !== null) {
            await this.application.process(payload.messageId, job === undefined || job.attemptsStarted >= job.maxAttempts);
        }
    }
}
