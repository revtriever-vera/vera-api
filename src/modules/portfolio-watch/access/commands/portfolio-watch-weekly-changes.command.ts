import { Injectable } from '@nestjs/common';
import { BaseCommand } from '../../../../core/queue/base.command';
import { QueueEnvelope, QueueHandlerPort } from '../../../../core/queue/queue.types';
import { COMMAND_KEYS, CRON, CommandKey } from '../../../../shared/constants/commands.constants';
import { MESSAGE_TYPES, QUEUES, QueueName } from '../../../../shared/constants/queues.constants';
import { PortfolioChangesApplication } from '../../application/portfolio-changes.application';

@Injectable()
export class PortfolioWatchWeeklyChangesCommand extends BaseCommand {
    public readonly key: CommandKey = COMMAND_KEYS.portfolioWatchWeeklyChanges;
    public readonly queue: QueueName = QUEUES.portfolioWatch;
    public readonly type: string = MESSAGE_TYPES.portfolioWatchWeeklyChangesRequested;
    public readonly pattern: string = CRON.everyMondayAtEightAm;
}

@Injectable()
export class PortfolioWatchWeeklyChangesTickHandler extends QueueHandlerPort {
    public readonly queue: QueueName = QUEUES.portfolioWatch;
    public readonly type: string = MESSAGE_TYPES.portfolioWatchWeeklyChangesRequested;

    public constructor(private readonly application: PortfolioChangesApplication) {
        super();
    }

    public async handle(_envelope: QueueEnvelope): Promise<void> {
        await this.application.fanOutWeekly();
    }
}
