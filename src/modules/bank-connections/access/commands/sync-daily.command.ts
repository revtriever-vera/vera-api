import { Injectable } from '@nestjs/common';
import { BaseCommand } from '../../../../core/queue/base.command';
import { QueueEnvelope, QueueHandlerPort } from '../../../../core/queue/queue.types';
import { COMMAND_KEYS, CRON, CommandKey } from '../../../../shared/constants/commands.constants';
import { MESSAGE_TYPES, QUEUES, QueueName } from '../../../../shared/constants/queues.constants';
import { SyncFanoutApplication } from '../../application/sync-fanout.application';

@Injectable()
export class SyncDailyCommand extends BaseCommand {
    public readonly key: CommandKey = COMMAND_KEYS.bankConnectionsSyncDaily;
    public readonly queue: QueueName = QUEUES.bankConnections;
    public readonly type: string = MESSAGE_TYPES.bankConnectionsSyncDailyRequested;
    public readonly pattern: string = CRON.everyDayAtSevenAm;
}

@Injectable()
export class SyncDailyTickHandler extends QueueHandlerPort {
    public readonly queue: QueueName = QUEUES.bankConnections;
    public readonly type: string = MESSAGE_TYPES.bankConnectionsSyncDailyRequested;

    public constructor(private readonly application: SyncFanoutApplication) {
        super();
    }

    public async handle(_envelope: QueueEnvelope): Promise<void> {
        await this.application.handleTick();
    }
}
