import { Injectable } from '@nestjs/common';
import { BaseCommand } from '../../../../core/queue/base.command';
import { QueueEnvelope, QueueHandlerPort } from '../../../../core/queue/queue.types';
import { COMMAND_KEYS, CRON, CommandKey } from '../../../../shared/constants/commands.constants';
import { MESSAGE_TYPES, QUEUES, QueueName } from '../../../../shared/constants/queues.constants';
import { RecurringNoticeDeliveryApplication } from '../../application/recurring-notice-delivery.application';

@Injectable()
export class RecurringNoticesDailyCommand extends BaseCommand {
    public readonly key: CommandKey = COMMAND_KEYS.recurringNoticesDaily;
    public readonly queue: QueueName = QUEUES.recurringNotices;
    public readonly type: string = MESSAGE_TYPES.recurringNoticesDailyRequested;
    public readonly pattern: string = CRON.everyDayAtFourAm;
}

@Injectable()
export class RecurringNoticesDailyTickHandler extends QueueHandlerPort {
    public readonly queue: QueueName = QUEUES.recurringNotices;
    public readonly type: string = MESSAGE_TYPES.recurringNoticesDailyRequested;

    public constructor(private readonly application: RecurringNoticeDeliveryApplication) {
        super();
    }

    public async handle(_envelope: QueueEnvelope): Promise<void> {
        await this.application.fanOutDaily();
    }
}
