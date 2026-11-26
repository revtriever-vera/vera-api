import { Injectable } from '@nestjs/common';
import { BaseCommand } from '../../../../core/queue/base.command';
import { QueueEnvelope, QueueHandlerPort } from '../../../../core/queue/queue.types';
import { COMMAND_KEYS, CRON, CommandKey } from '../../../../shared/constants/commands.constants';
import { MESSAGE_TYPES, QUEUES, QueueName } from '../../../../shared/constants/queues.constants';
import { PortfolioEventsSweepApplication } from '../../application/portfolio-events-sweep.application';

@Injectable()
export class PortfolioEventsDailyCommand extends BaseCommand {
    public readonly key: CommandKey = COMMAND_KEYS.portfolioEventsDaily;
    public readonly queue: QueueName = QUEUES.portfolioEvents;
    public readonly type: string = MESSAGE_TYPES.portfolioEventsDailyRequested;
    public readonly pattern: string = CRON.everyDayAtSevenAm;
}

@Injectable()
export class PortfolioEventsDailyTickHandler extends QueueHandlerPort {
    public readonly queue: QueueName = QUEUES.portfolioEvents;
    public readonly type: string = MESSAGE_TYPES.portfolioEventsDailyRequested;

    public constructor(private readonly application: PortfolioEventsSweepApplication) {
        super();
    }

    public async handle(_envelope: QueueEnvelope): Promise<void> {
        await this.application.handleTick();
    }
}
