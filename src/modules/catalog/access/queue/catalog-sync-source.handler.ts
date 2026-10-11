import { Injectable } from '@nestjs/common';
import { QueueEnvelope, QueueHandlerPort } from '../../../../core/queue/queue.types';
import { MESSAGE_TYPES, QUEUES, QueueName } from '../../../../shared/constants/queues.constants';
import { CatalogSyncApplication } from '../../application/catalog-sync.application';

@Injectable()
export class CatalogSyncSourceHandler extends QueueHandlerPort {
    public readonly queue: QueueName = QUEUES.catalog;
    public readonly type: string = MESSAGE_TYPES.catalogSyncSourceRequested;

    public constructor(private readonly application: CatalogSyncApplication) {
        super();
    }

    public async handle(envelope: QueueEnvelope): Promise<void> {
        await this.application.handleSource(envelope.payload);
    }
}
