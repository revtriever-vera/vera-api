import { Injectable } from '@nestjs/common';
import { JobMutex } from '../../../../core/queue/job-mutex.decorator';
import { QueueEnvelope, QueueHandlerPort, RunningJob } from '../../../../core/queue/queue.types';
import { RedisConnection } from '../../../../core/queue/redis.connection';
import { MESSAGE_TYPES, QUEUES, QueueName } from '../../../../shared/constants/queues.constants';
import { PortfolioEventsBatchApplication } from '../../application/portfolio-events-batch.application';

const UNKNOWN_SOURCE: string = 'unknown';

function sourceOf(envelope: unknown): string {
    const source: unknown = (envelope as { payload?: { source?: unknown } } | null)?.payload?.source;
    return typeof source === 'string' ? source : UNKNOWN_SOURCE;
}

@Injectable()
export class PortfolioEventsBatchHandler extends QueueHandlerPort {
    public readonly queue: QueueName = QUEUES.portfolioEvents;
    public readonly type: string = MESSAGE_TYPES.portfolioEventsBatchRequested;

    public constructor(
        private readonly application: PortfolioEventsBatchApplication,
        public readonly redis: RedisConnection
    ) {
        super();
    }

    @JobMutex({ lockKey: 'portfolio-events-batch', identify: sourceOf })
    public async handle(envelope: QueueEnvelope, _job?: RunningJob): Promise<void> {
        await this.application.handleBatch(envelope.payload);
    }
}
