import { Injectable } from '@nestjs/common';
import { BaseCommand } from '../../../../core/queue/base.command';
import { QueueEnvelope, QueueHandlerPort } from '../../../../core/queue/queue.types';
import { COMMAND_KEYS, CRON, CommandKey } from '../../../../shared/constants/commands.constants';
import { MESSAGE_TYPES, QUEUES, QueueName } from '../../../../shared/constants/queues.constants';
import { PortfolioWatchDailyApplication } from '../../application/portfolio-watch-daily.application';

@Injectable()
export class PortfolioWatchDailyCommand extends BaseCommand {
    public readonly key: CommandKey = COMMAND_KEYS.portfolioWatchDaily;
    public readonly queue: QueueName = QUEUES.portfolioWatch;
    public readonly type: string = MESSAGE_TYPES.portfolioWatchDailyRequested;
    public readonly pattern: string = CRON.everyDayAtNineAm;
}

@Injectable()
export class PortfolioWatchDailyTickHandler extends QueueHandlerPort {
    public readonly queue: QueueName = QUEUES.portfolioWatch;
    public readonly type: string = MESSAGE_TYPES.portfolioWatchDailyRequested;

    public constructor(private readonly application: PortfolioWatchDailyApplication) {
        super();
    }

    public async handle(_envelope: QueueEnvelope): Promise<void> {
        await this.application.fanOutDaily();
    }
}
