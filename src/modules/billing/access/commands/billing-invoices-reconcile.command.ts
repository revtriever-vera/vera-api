import { Injectable } from '@nestjs/common';
import { BaseCommand } from '../../../../core/queue/base.command';
import { QueueEnvelope, QueueHandlerPort } from '../../../../core/queue/queue.types';
import { COMMAND_KEYS, CRON, CommandKey } from '../../../../shared/constants/commands.constants';
import { MESSAGE_TYPES, QUEUES, QueueName } from '../../../../shared/constants/queues.constants';
import { BillingEventsApplication } from '../../application/billing-events.application';

@Injectable()
export class BillingInvoicesReconcileCommand extends BaseCommand {
    public readonly key: CommandKey = COMMAND_KEYS.billingInvoicesReconcile;
    public readonly queue: QueueName = QUEUES.billing;
    public readonly type: string = MESSAGE_TYPES.billingInvoicesReconcileRequested;
    public readonly pattern: string = CRON.everyDayAtSevenAm;
}

@Injectable()
export class BillingInvoicesReconcileTickHandler extends QueueHandlerPort {
    public readonly queue: QueueName = QUEUES.billing;
    public readonly type: string = MESSAGE_TYPES.billingInvoicesReconcileRequested;

    public constructor(private readonly application: BillingEventsApplication) {
        super();
    }

    public async handle(_envelope: QueueEnvelope): Promise<void> {
        await this.application.reconcile();
    }
}
