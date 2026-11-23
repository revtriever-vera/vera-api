import { Injectable } from '@nestjs/common';
import { QueueEnvelope, QueueHandlerPort } from '../../../../core/queue/queue.types';
import { UsageThresholdPayload } from '../../../../core/usage/usage.types';
import { MESSAGE_TYPES, QUEUES, QueueName } from '../../../../shared/constants/queues.constants';
import { UsageApplication } from '../../application/usage.application';

@Injectable()
export class UsageThresholdHandler extends QueueHandlerPort<UsageThresholdPayload> {
    public readonly queue: QueueName = QUEUES.usage;
    public readonly type: string = MESSAGE_TYPES.usageThresholdCrossed;

    public constructor(private readonly application: UsageApplication) {
        super();
    }

    public async handle(envelope: QueueEnvelope<UsageThresholdPayload>): Promise<void> {
        if (envelope.companyId === null) {
            return;
        }
        await this.application.sendNotice(envelope.companyId, envelope.payload);
    }
}
