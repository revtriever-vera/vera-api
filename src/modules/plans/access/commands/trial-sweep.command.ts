import { Injectable } from '@nestjs/common';
import { BaseCommand } from '../../../../core/queue/base.command';
import { QueueEnvelope, QueueHandlerPort } from '../../../../core/queue/queue.types';
import { COMMAND_KEYS, CRON, CommandKey } from '../../../../shared/constants/commands.constants';
import { MESSAGE_TYPES, QUEUES, QueueName } from '../../../../shared/constants/queues.constants';
import { PremiumEndedRetryApplication } from '../../application/premium-ended-retry.application';

@Injectable()
export class TrialSweepCommand extends BaseCommand {
    public readonly key: CommandKey = COMMAND_KEYS.plansTrialSweep;
    public readonly queue: QueueName = QUEUES.plans;
    public readonly type: string = MESSAGE_TYPES.plansTrialSweepRequested;
    public readonly pattern: string = CRON.everyHour;
}

@Injectable()
export class TrialSweepTickHandler extends QueueHandlerPort {
    public readonly queue: QueueName = QUEUES.plans;
    public readonly type: string = MESSAGE_TYPES.plansTrialSweepRequested;

    public constructor(private readonly application: PremiumEndedRetryApplication) {
        super();
    }

    public async handle(_envelope: QueueEnvelope): Promise<void> {
        await this.application.sweepTrials();
    }
}
