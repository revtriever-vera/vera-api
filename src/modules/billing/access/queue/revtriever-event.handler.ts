import { Injectable } from '@nestjs/common';
import { QueueEnvelope, QueueHandlerPort } from '../../../../core/queue/queue.types';
import { MESSAGE_TYPES, QUEUES, QueueName } from '../../../../shared/constants/queues.constants';
import { BillingEventsApplication } from '../../application/billing-events.application';

interface EventPayload {
    readonly eventId: string;
}

@Injectable()
export class RevtrieverEventHandler extends QueueHandlerPort<EventPayload> {
    public readonly queue: QueueName = QUEUES.billing;
    public readonly type: string = MESSAGE_TYPES.billingRevtrieverEventReceived;

    public constructor(private readonly application: BillingEventsApplication) {
        super();
    }

    public async handle(envelope: QueueEnvelope<EventPayload>): Promise<void> {
        await this.application.process(envelope.payload.eventId);
    }
}
