import { Injectable } from '@nestjs/common';
import { BaseCommand } from '../../../../core/queue/base.command';
import { QueueEnvelope, QueueHandlerPort } from '../../../../core/queue/queue.types';
import { COMMAND_KEYS, CRON, CommandKey } from '../../../../shared/constants/commands.constants';
import { MESSAGE_TYPES, QUEUES, QueueName } from '../../../../shared/constants/queues.constants';
import { ReminderMaintenanceApplication } from '../../application/reminder-maintenance.application';

@Injectable()
export class RemindersGaugeCommand extends BaseCommand {
    public readonly key: CommandKey = COMMAND_KEYS.remindersGauge;
    public readonly queue: QueueName = QUEUES.reminders;
    public readonly type: string = MESSAGE_TYPES.remindersGaugeRequested;
    public readonly pattern: string = CRON.everyDayAtFourAm;
}

@Injectable()
export class RemindersGaugeTickHandler extends QueueHandlerPort {
    public readonly queue: QueueName = QUEUES.reminders;
    public readonly type: string = MESSAGE_TYPES.remindersGaugeRequested;

    public constructor(private readonly application: ReminderMaintenanceApplication) {
        super();
    }

    public async handle(_envelope: QueueEnvelope): Promise<void> {
        await this.application.publishGauge();
    }
}
