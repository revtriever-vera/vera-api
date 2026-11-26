import { Injectable } from '@nestjs/common';
import { BaseCommand } from '../../../../core/queue/base.command';
import { QueueEnvelope, QueueHandlerPort } from '../../../../core/queue/queue.types';
import { COMMAND_KEYS, CRON, CommandKey } from '../../../../shared/constants/commands.constants';
import { MESSAGE_TYPES, QUEUES, QueueName } from '../../../../shared/constants/queues.constants';
import { PortfolioMonthlyReviewApplication } from '../../application/portfolio-monthly-review.application';

@Injectable()
export class PortfolioWatchMonthlyReviewCommand extends BaseCommand {
    public readonly key: CommandKey = COMMAND_KEYS.portfolioWatchMonthlyReview;
    public readonly queue: QueueName = QUEUES.portfolioWatch;
    public readonly type: string = MESSAGE_TYPES.portfolioWatchMonthlyReviewRequested;
    public readonly pattern: string = CRON.firstOfMonthAtFiveAm;
}

@Injectable()
export class PortfolioWatchMonthlyReviewTickHandler extends QueueHandlerPort {
    public readonly queue: QueueName = QUEUES.portfolioWatch;
    public readonly type: string = MESSAGE_TYPES.portfolioWatchMonthlyReviewRequested;

    public constructor(private readonly application: PortfolioMonthlyReviewApplication) {
        super();
    }

    public async handle(_envelope: QueueEnvelope): Promise<void> {
        await this.application.fanOutMonthly();
    }
}
