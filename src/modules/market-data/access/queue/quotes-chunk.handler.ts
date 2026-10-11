import { Injectable } from '@nestjs/common';
import { QueueEnvelope, QueueHandlerPort } from '../../../../core/queue/queue.types';
import { MESSAGE_TYPES, QUEUES, QueueName } from '../../../../shared/constants/queues.constants';
import { QuotesChunkApplication } from '../../application/quotes-chunk.application';

@Injectable()
export class QuotesChunkHandler extends QueueHandlerPort {
    public readonly queue: QueueName = QUEUES.marketData;
    public readonly type: string = MESSAGE_TYPES.marketDataQuotesChunkRequested;

    public constructor(private readonly application: QuotesChunkApplication) {
        super();
    }

    public async handle(envelope: QueueEnvelope): Promise<void> {
        await this.application.handleChunk(envelope.payload);
    }
}
