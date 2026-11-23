import { Injectable } from '@nestjs/common';
import { BaseCommand } from '../../../../core/queue/base.command';
import { QueueEnvelope, QueueHandlerPort } from '../../../../core/queue/queue.types';
import { COMMAND_KEYS, CRON, CommandKey } from '../../../../shared/constants/commands.constants';
import { MESSAGE_TYPES, QUEUES, QueueName } from '../../../../shared/constants/queues.constants';
import { BillingEventsApplication } from '../../application/billing-events.application';

@Injectable()
export class BillingStandingSweepCommand extends BaseCommand {
    public readonly key: CommandKey = COMMAND_KEYS.billingStandingSweep;
    public readonly queue: QueueName = QUEUES.billing;
    public readonly type: string = MESSAGE_TYPES.billingStandingSweepRequested;
    public readonly pattern: string = CRON.everyHour;
}

@Injectable()
export class BillingStandingSweepTickHandler extends QueueHandlerPort {
    public readonly queue: QueueName = QUEUES.billing;
    public readonly type: string = MESSAGE_TYPES.billingStandingSweepRequested;

    public constructor(private readonly application: BillingEventsApplication) {
        super();
    }

    public async handle(_envelope: QueueEnvelope): Promise<void> {
        await this.application.sweepStandings();
    }
}
