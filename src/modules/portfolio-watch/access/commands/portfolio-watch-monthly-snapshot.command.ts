import { Injectable } from '@nestjs/common';
import { BaseCommand } from '../../../../core/queue/base.command';
import { QueueEnvelope, QueueHandlerPort } from '../../../../core/queue/queue.types';
import { COMMAND_KEYS, CRON, CommandKey } from '../../../../shared/constants/commands.constants';
import { MESSAGE_TYPES, QUEUES, QueueName } from '../../../../shared/constants/queues.constants';
import { PortfolioWatchSnapshotApplication } from '../../application/portfolio-watch-snapshot.application';

@Injectable()
export class PortfolioWatchMonthlySnapshotCommand extends BaseCommand {
    public readonly key: CommandKey = COMMAND_KEYS.portfolioWatchMonthlySnapshot;
    public readonly queue: QueueName = QUEUES.portfolioWatch;
    public readonly type: string = MESSAGE_TYPES.portfolioWatchMonthlySnapshotRequested;
    public readonly pattern: string = CRON.firstOfMonthAtFourAm;
}

@Injectable()
export class PortfolioWatchMonthlySnapshotTickHandler extends QueueHandlerPort {
    public readonly queue: QueueName = QUEUES.portfolioWatch;
    public readonly type: string = MESSAGE_TYPES.portfolioWatchMonthlySnapshotRequested;

    public constructor(private readonly application: PortfolioWatchSnapshotApplication) {
        super();
    }

    public async handle(_envelope: QueueEnvelope): Promise<void> {
        await this.application.fanOutMonthly();
    }
}
