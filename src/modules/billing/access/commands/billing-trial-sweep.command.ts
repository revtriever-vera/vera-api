import { Injectable } from '@nestjs/common';
import { BaseCommand } from '../../../../core/queue/base.command';
import { QueueEnvelope, QueueHandlerPort } from '../../../../core/queue/queue.types';
import { COMMAND_KEYS, CRON, CommandKey } from '../../../../shared/constants/commands.constants';
import { MESSAGE_TYPES, QUEUES, QueueName } from '../../../../shared/constants/queues.constants';
import { SubscriptionApplication } from '../../application/subscription.application';

@Injectable()
export class BillingTrialSweepCommand extends BaseCommand {
    public readonly key: CommandKey = COMMAND_KEYS.billingTrialSweep;
    public readonly queue: QueueName = QUEUES.billing;
    public readonly type: string = MESSAGE_TYPES.billingTrialSweepRequested;
    public readonly pattern: string = CRON.everyHour;
}

@Injectable()
export class BillingTrialSweepTickHandler extends QueueHandlerPort {
    public readonly queue: QueueName = QUEUES.billing;
    public readonly type: string = MESSAGE_TYPES.billingTrialSweepRequested;

    public constructor(private readonly application: SubscriptionApplication) {
        super();
    }

    public async handle(_envelope: QueueEnvelope): Promise<void> {
        await this.application.sweepTrials();
    }
}
