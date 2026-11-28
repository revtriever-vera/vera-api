import { Injectable } from '@nestjs/common';
import { QueueEnvelope, QueueHandlerPort } from '../../../../core/queue/queue.types';
import { MESSAGE_TYPES, QUEUES, QueueName } from '../../../../shared/constants/queues.constants';
import { PluggyConnectApplication } from '../../application/pluggy-connect.application';
import { ITEM_OUTCOMES } from '../../domain/bank-connections.types';
import type { WebhookOutcome } from '../../services/bank-connections-log.service';

@Injectable()
export class NotifiedItemRegistrationHandler extends QueueHandlerPort {
    public readonly queue: QueueName = QUEUES.bankConnections;
    public readonly type: string = MESSAGE_TYPES.bankConnectionsPluggyItemCreated;

    public constructor(private readonly application: PluggyConnectApplication) {
        super();
    }

    public async handle(envelope: QueueEnvelope): Promise<void> {
        const outcome: WebhookOutcome = await this.application.registerNotified(envelope.payload);
        if (outcome === ITEM_OUTCOMES.failed) {
            throw new Error('pluggy_item_registration_failed');
        }
    }
}
