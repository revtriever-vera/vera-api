import { Injectable } from '@nestjs/common';
import { QueueEnvelope, QueueHandlerPort } from '../../../../core/queue/queue.types';
import { MESSAGE_TYPES, QUEUES, QueueName } from '../../../../shared/constants/queues.constants';
import { IndexSyncApplication } from '../../application/index-sync.application';

@Injectable()
export class IndexSyncTickHandler extends QueueHandlerPort {
    public readonly queue: QueueName = QUEUES.fixedIncome;
    public readonly type: string = MESSAGE_TYPES.fixedIncomeIndexSyncRequested;

    public constructor(private readonly sync: IndexSyncApplication) {
        super();
    }

    public async handle(_envelope: QueueEnvelope): Promise<void> {
        await this.sync.requestSync();
    }
}
