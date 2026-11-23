import { Injectable } from '@nestjs/common';
import { BaseCommand } from '../../../../core/queue/base.command';
import { QueueEnvelope, QueueHandlerPort } from '../../../../core/queue/queue.types';
import { COMMAND_KEYS, CRON, CommandKey } from '../../../../shared/constants/commands.constants';
import { MESSAGE_TYPES, QUEUES, QueueName } from '../../../../shared/constants/queues.constants';
import { BillingEventsApplication } from '../../application/billing-events.application';

@Injectable()
export class BillingEventsReplayCommand extends BaseCommand {
    public readonly key: CommandKey = COMMAND_KEYS.billingEventsReplay;
    public readonly queue: QueueName = QUEUES.billing;
    public readonly type: string = MESSAGE_TYPES.billingEventsReplayRequested;
    public readonly pattern: string = CRON.everyFifteenMinutes;
}

@Injectable()
export class BillingEventsReplayTickHandler extends QueueHandlerPort {
    public readonly queue: QueueName = QUEUES.billing;
    public readonly type: string = MESSAGE_TYPES.billingEventsReplayRequested;

    public constructor(private readonly application: BillingEventsApplication) {
        super();
    }

    public async handle(_envelope: QueueEnvelope): Promise<void> {
        await this.application.replay();
    }
}
