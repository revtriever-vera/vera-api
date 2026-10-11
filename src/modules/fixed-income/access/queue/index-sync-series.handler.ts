import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { QueueEnvelope, QueueHandlerPort } from '../../../../core/queue/queue.types';
import { MESSAGE_TYPES, QUEUES, QueueName } from '../../../../shared/constants/queues.constants';
import { IndexSyncApplication, SeriesSyncPayload } from '../../application/index-sync.application';
import { INDEX_SERIES } from '../../domain/index-series';

const DATE: RegExp = /^\d{4}-\d{2}-\d{2}$/;

const payloadSchema: z.ZodType<SeriesSyncPayload> = z.object({
    series: z.nativeEnum(INDEX_SERIES),
    from: z.string().regex(DATE),
    to: z.string().regex(DATE)
});

@Injectable()
export class IndexSyncSeriesHandler extends QueueHandlerPort {
    public readonly queue: QueueName = QUEUES.fixedIncome;
    public readonly type: string = MESSAGE_TYPES.fixedIncomeIndexSyncSeriesRequested;

    public constructor(private readonly sync: IndexSyncApplication) {
        super();
    }

    public async handle(envelope: QueueEnvelope): Promise<void> {
        await this.sync.syncWindow(payloadSchema.parse(envelope.payload));
    }
}
