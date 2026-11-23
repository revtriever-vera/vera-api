import { Injectable } from '@nestjs/common';
import { BaseCommand } from '../../../../core/queue/base.command';
import { QueueEnvelope, QueueHandlerPort } from '../../../../core/queue/queue.types';
import { COMMAND_KEYS, CRON, CommandKey } from '../../../../shared/constants/commands.constants';
import { MESSAGE_TYPES, QUEUES, QueueName } from '../../../../shared/constants/queues.constants';
import { ReminderMaintenanceApplication } from '../../application/reminder-maintenance.application';

@Injectable()
export class RemindersSweepCommand extends BaseCommand {
    public readonly key: CommandKey = COMMAND_KEYS.remindersSweep;
    public readonly queue: QueueName = QUEUES.reminders;
    public readonly type: string = MESSAGE_TYPES.remindersSweepRequested;
    public readonly pattern: string = CRON.everyFiveMinutes;
}

@Injectable()
export class RemindersSweepTickHandler extends QueueHandlerPort {
    public readonly queue: QueueName = QUEUES.reminders;
    public readonly type: string = MESSAGE_TYPES.remindersSweepRequested;

    public constructor(private readonly application: ReminderMaintenanceApplication) {
        super();
    }

    public async handle(_envelope: QueueEnvelope): Promise<void> {
        await this.application.sweep();
    }
}
