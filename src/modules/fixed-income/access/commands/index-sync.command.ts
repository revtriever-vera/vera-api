import { Injectable } from '@nestjs/common';
import { BaseCommand } from '../../../../core/queue/base.command';
import { COMMAND_KEYS, CRON, CommandKey } from '../../../../shared/constants/commands.constants';
import { MESSAGE_TYPES, QUEUES, QueueName } from '../../../../shared/constants/queues.constants';

@Injectable()
export class IndexSyncCommand extends BaseCommand {
    public readonly key: CommandKey = COMMAND_KEYS.fixedIncomeIndexSync;
    public readonly queue: QueueName = QUEUES.fixedIncome;
    public readonly type: string = MESSAGE_TYPES.fixedIncomeIndexSyncRequested;
    public readonly pattern: string = CRON.everyDayAtNineThirtyAm;
}
