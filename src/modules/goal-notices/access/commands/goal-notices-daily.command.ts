import { Injectable } from '@nestjs/common';
import { BaseCommand } from '../../../../core/queue/base.command';
import { QueueEnvelope, QueueHandlerPort } from '../../../../core/queue/queue.types';
import { COMMAND_KEYS, CRON, CommandKey } from '../../../../shared/constants/commands.constants';
import { MESSAGE_TYPES, QUEUES, QueueName } from '../../../../shared/constants/queues.constants';
import { GoalNoticesApplication } from '../../application/goal-notices.application';

@Injectable()
export class GoalNoticesDailyCommand extends BaseCommand {
    public readonly key: CommandKey = COMMAND_KEYS.goalNoticesDaily;
    public readonly queue: QueueName = QUEUES.goalNotices;
    public readonly type: string = MESSAGE_TYPES.goalNoticesDailyRequested;
    public readonly pattern: string = CRON.everyDayAtNineAm;
}

@Injectable()
export class GoalNoticesDailyTickHandler extends QueueHandlerPort {
    public readonly queue: QueueName = QUEUES.goalNotices;
    public readonly type: string = MESSAGE_TYPES.goalNoticesDailyRequested;

    public constructor(private readonly application: GoalNoticesApplication) {
        super();
    }

    public async handle(_envelope: QueueEnvelope): Promise<void> {
        await this.application.fanOutDaily();
    }
}
