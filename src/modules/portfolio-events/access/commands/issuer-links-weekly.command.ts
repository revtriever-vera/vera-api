import { Injectable } from '@nestjs/common';
import { BaseCommand } from '../../../../core/queue/base.command';
import { QueueEnvelope, QueueHandlerPort } from '../../../../core/queue/queue.types';
import { COMMAND_KEYS, CRON, CommandKey } from '../../../../shared/constants/commands.constants';
import { MESSAGE_TYPES, QUEUES, QueueName } from '../../../../shared/constants/queues.constants';
import { IssuerLinksApplication } from '../../application/issuer-links.application';

@Injectable()
export class IssuerLinksWeeklyCommand extends BaseCommand {
    public readonly key: CommandKey = COMMAND_KEYS.portfolioEventsLinksWeekly;
    public readonly queue: QueueName = QUEUES.portfolioEvents;
    public readonly type: string = MESSAGE_TYPES.portfolioEventsLinksRequested;
    public readonly pattern: string = CRON.everyMondayAtSevenAm;
}

@Injectable()
export class IssuerLinksWeeklyTickHandler extends QueueHandlerPort {
    public readonly queue: QueueName = QUEUES.portfolioEvents;
    public readonly type: string = MESSAGE_TYPES.portfolioEventsLinksRequested;

    public constructor(private readonly application: IssuerLinksApplication) {
        super();
    }

    public async handle(_envelope: QueueEnvelope): Promise<void> {
        await this.application.refresh();
    }
}
