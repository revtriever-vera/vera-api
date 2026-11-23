import { Injectable } from '@nestjs/common';
import { BaseCommand } from '../../../../core/queue/base.command';
import { QueueEnvelope, QueueHandlerPort } from '../../../../core/queue/queue.types';
import { COMMAND_KEYS, CRON, CommandKey } from '../../../../shared/constants/commands.constants';
import { MESSAGE_TYPES, QUEUES, QueueName } from '../../../../shared/constants/queues.constants';
import { RecurringDetectionApplication } from '../../application/recurring-detection.application';

@Injectable()
export class RecurringDailyCommand extends BaseCommand {
    public readonly key: CommandKey = COMMAND_KEYS.recurringDaily;
    public readonly queue: QueueName = QUEUES.recurring;
    public readonly type: string = MESSAGE_TYPES.recurringDailyRequested;
    public readonly pattern: string = CRON.everyDayAtFourAm;
}

@Injectable()
export class RecurringDailyTickHandler extends QueueHandlerPort {
    public readonly queue: QueueName = QUEUES.recurring;
    public readonly type: string = MESSAGE_TYPES.recurringDailyRequested;

    public constructor(private readonly application: RecurringDetectionApplication) {
        super();
    }

    public async handle(_envelope: QueueEnvelope): Promise<void> {
        await this.application.fanOutDaily();
    }
}
