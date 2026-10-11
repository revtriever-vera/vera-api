import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { DelayedError } from 'bullmq';
import { JobMutex } from '../../../../core/queue/job-mutex.decorator';
import { QueueEnvelope, QueueHandlerPort, QueueWorkerOptions, RunningJob } from '../../../../core/queue/queue.types';
import { RedisConnection } from '../../../../core/queue/redis.connection';
import { MESSAGE_TYPES, QUEUES, QueueName } from '../../../../shared/constants/queues.constants';
import { ConnectionSyncApplication, SyncDirective } from '../../application/connection-sync.application';
import { bankConnectionsConfig } from '../../config/bank-connections.config';

const SYNC_CONCURRENCY: number = 2;
const LIMITER_WINDOW_MS: number = 60_000;
const MILLISECONDS: number = 1000;
const UNKNOWN_CONNECTION: string = 'unknown';

function connectionOf(envelope: unknown): string {
    const connectionId: unknown = (envelope as { payload?: { connectionId?: unknown } } | null)?.payload?.connectionId;
    return typeof connectionId === 'string' ? connectionId : UNKNOWN_CONNECTION;
}

@Injectable()
export class ConnectionSyncHandler extends QueueHandlerPort {
    public readonly queue: QueueName = QUEUES.bankConnections;
    public readonly type: string = MESSAGE_TYPES.bankConnectionsSyncRequested;
    public override readonly workerOptions: QueueWorkerOptions;

    public constructor(
        private readonly application: ConnectionSyncApplication,
        public readonly redis: RedisConnection,
        @Inject(bankConnectionsConfig.KEY) config: ConfigType<typeof bankConnectionsConfig>
    ) {
        super();
        this.workerOptions = {
            concurrency: SYNC_CONCURRENCY,
            limiter: { max: config.PLUGGY_SYNC_JOBS_PER_MINUTE, duration: LIMITER_WINDOW_MS }
        };
    }

    @JobMutex({ lockKey: 'pluggy-sync', identify: connectionOf })
    public async handle(envelope: QueueEnvelope, job?: RunningJob): Promise<void> {
        const directive: SyncDirective = await this.application.handle(envelope.payload);
        if (directive.retryAfterSeconds !== null && job !== undefined && job.attemptsStarted < job.maxAttempts) {
            await job.moveToDelayed(Date.now() + directive.retryAfterSeconds * MILLISECONDS);
            throw new DelayedError('pluggy asked to retry later');
        }
        if (directive.failure !== null) {
            throw directive.failure instanceof Error ? directive.failure : new Error('pluggy_sync_failed');
        }
    }
}
