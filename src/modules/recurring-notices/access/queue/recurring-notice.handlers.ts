import { Injectable } from '@nestjs/common';
import { QueueEnvelope, QueueHandlerPort } from '../../../../core/queue/queue.types';
import { MESSAGE_TYPES, QUEUES, QueueName } from '../../../../shared/constants/queues.constants';
import { RecurringNoticeDeliveryApplication } from '../../application/recurring-notice-delivery.application';
import { duePayloadSchema, schedulePayloadSchema, weekPayloadSchema } from '../../validation/recurring-notices.schemas';

@Injectable()
export class RecurringNoticeScheduleHandler extends QueueHandlerPort {
    public readonly queue: QueueName = QUEUES.recurringNotices;
    public readonly type: string = MESSAGE_TYPES.recurringNoticesScheduleRequested;

    public constructor(private readonly application: RecurringNoticeDeliveryApplication) {
        super();
    }

    public async handle(envelope: QueueEnvelope): Promise<void> {
        const parsed: ReturnType<typeof schedulePayloadSchema.safeParse> = schedulePayloadSchema.safeParse(envelope.payload);
        if (parsed.success) {
            await this.application.scheduleCompany(parsed.data.companyId);
        }
    }
}

@Injectable()
export class RecurringWeekNoticeHandler extends QueueHandlerPort {
    public readonly queue: QueueName = QUEUES.recurringNotices;
    public readonly type: string = MESSAGE_TYPES.recurringWeekDue;

    public constructor(private readonly application: RecurringNoticeDeliveryApplication) {
        super();
    }

    public async handle(envelope: QueueEnvelope): Promise<void> {
        const parsed: ReturnType<typeof weekPayloadSchema.safeParse> = weekPayloadSchema.safeParse(envelope.payload);
        if (parsed.success) {
            await this.application.sendWeek(parsed.data.companyId, parsed.data.monday);
        }
    }
}

@Injectable()
export class RecurringDueNoticeHandler extends QueueHandlerPort {
    public readonly queue: QueueName = QUEUES.recurringNotices;
    public readonly type: string = MESSAGE_TYPES.recurringDueDue;

    public constructor(private readonly application: RecurringNoticeDeliveryApplication) {
        super();
    }

    public async handle(envelope: QueueEnvelope): Promise<void> {
        const parsed: ReturnType<typeof duePayloadSchema.safeParse> = duePayloadSchema.safeParse(envelope.payload);
        if (parsed.success) {
            await this.application.sendDue(parsed.data.companyId, parsed.data.seriesId, parsed.data.userId, parsed.data.date);
        }
    }
}
