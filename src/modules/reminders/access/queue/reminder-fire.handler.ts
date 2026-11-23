import { Injectable } from '@nestjs/common';
import { QueueEnvelope, QueueHandlerPort } from '../../../../core/queue/queue.types';
import { MESSAGE_TYPES, QUEUES, QueueName } from '../../../../shared/constants/queues.constants';
import { OutboundFailure, OutboundFailurePort } from '../../../whatsapp/services/outbound-failure.port';
import { ReminderFireApplication } from '../../application/reminder-fire.application';
import { firePayloadSchema } from '../../validation/reminders.schemas';

@Injectable()
export class ReminderFireHandler extends QueueHandlerPort {
    public readonly queue: QueueName = QUEUES.reminders;
    public readonly type: string = MESSAGE_TYPES.remindersFireRequested;

    public constructor(private readonly application: ReminderFireApplication) {
        super();
    }

    public async handle(envelope: QueueEnvelope): Promise<void> {
        const parsed: ReturnType<typeof firePayloadSchema.safeParse> = firePayloadSchema.safeParse(envelope.payload);
        if (parsed.success) {
            await this.application.fire(parsed.data.occurrenceId);
        }
    }
}

@Injectable()
export class ReminderDeliveryObserver extends OutboundFailurePort {
    public constructor(private readonly application: ReminderFireApplication) {
        super();
    }

    public async onOutboundFailed(failure: OutboundFailure): Promise<void> {
        await this.application.onOutboundFailed(failure.messageId);
    }
}
