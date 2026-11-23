import { Injectable } from '@nestjs/common';
import { QueueEnvelope, QueueHandlerPort } from '../../../../core/queue/queue.types';
import { MESSAGE_TYPES, QUEUES, QueueName } from '../../../../shared/constants/queues.constants';
import { PremiumEndedRetryApplication } from '../../application/premium-ended-retry.application';

interface RetryPayload {
    readonly notificationId: string;
}

@Injectable()
export class PremiumEndedRetryHandler extends QueueHandlerPort<RetryPayload> {
    public readonly queue: QueueName = QUEUES.plans;
    public readonly type: string = MESSAGE_TYPES.plansPremiumEndedRetryRequested;

    public constructor(private readonly application: PremiumEndedRetryApplication) {
        super();
    }

    public async handle(envelope: QueueEnvelope<RetryPayload>): Promise<void> {
        if (envelope.companyId === null) {
            return;
        }
        await this.application.retry(envelope.companyId, envelope.payload.notificationId);
    }
}
