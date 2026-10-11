import { BeforeApplicationShutdown, Injectable } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { BULL_PREFIX, QueueName } from '../../shared/constants/queues.constants';
import { AppContext, AppContextData } from '../context/app-context.port';
import { DatabaseClient } from '../database/database.client';
import { TracingService } from '../observability/tracing.service';
import { QueueLogService } from './queue-log.service';
import { RedisConnection } from './redis.connection';
import { PublishOptions, QueueEnvelope, QueuePublisherPort } from './queue.types';

const KEEP_COMPLETED: number = 1000;
const KEEP_FAILED: number = 5000;
export const DEFAULT_ATTEMPTS: number = 5;
export const BACKOFF_DELAY_MS: number = 5000;

export function retryWindowSeconds(): number {
    const delays: number[] = Array.from(
        { length: DEFAULT_ATTEMPTS - 1 },
        (_unused: unknown, index: number) => BACKOFF_DELAY_MS * 2 ** index
    );
    return delays.reduce((total: number, delay: number) => total + delay, 0) / 1000;
}

@Injectable()
export class BullQueuePublisher extends QueuePublisherPort implements BeforeApplicationShutdown {
    private readonly queues: Map<QueueName, Queue> = new Map<QueueName, Queue>();

    public constructor(
        private readonly redis: RedisConnection,
        private readonly context: AppContext,
        private readonly tracing: TracingService,
        private readonly database: DatabaseClient,
        private readonly logs: QueueLogService
    ) {
        super();
    }

    public async publish(queue: QueueName, type: string, payload: unknown, options?: PublishOptions): Promise<void> {
        const ctx: AppContextData | null = this.context.getOrNull();
        const envelope: QueueEnvelope = {
            type,
            requestId: ctx?.requestId ?? 'unknown',
            companyId: ctx?.companyId ?? null,
            locale: ctx?.locale,
            occurredAt: new Date().toISOString(),
            trace: this.tracing.inject(),
            payload
        };
        await this.database.afterCommit(async () => this.enqueue(queue, type, envelope, options));
    }

    private async enqueue(queue: QueueName, type: string, envelope: QueueEnvelope, options?: PublishOptions): Promise<void> {
        try {
            const target: Queue = this.queueFor(queue);
            if (!(await this.clearSuperseded(target, options))) {
                this.logs.enqueueSkippedRunning(queue, type, options?.jobId ?? '');
                return;
            }
            await target.add(type, envelope, {
                jobId: options?.jobId,
                delay: options?.delayMs,
                attempts: options?.attempts ?? DEFAULT_ATTEMPTS,
                backoff: { type: 'exponential', delay: BACKOFF_DELAY_MS },
                removeOnComplete: KEEP_COMPLETED,
                removeOnFail: KEEP_FAILED
            });
        } catch (error: unknown) {
            this.logs.enqueueFailed(queue, type, error);
            throw error;
        }
    }

    private async clearSuperseded(queue: Queue, options?: PublishOptions): Promise<boolean> {
        if (options?.replaceExisting !== true || options.jobId === undefined) {
            return true;
        }
        const previous: Job | undefined = await queue.getJob(options.jobId);
        if (!previous) {
            return true;
        }
        if (await previous.isActive()) {
            return false;
        }
        await previous.remove();
        return true;
    }

    public async beforeApplicationShutdown(): Promise<void> {
        await Promise.all([...this.queues.values()].map(async (queue: Queue) => queue.close()));
    }

    private queueFor(name: QueueName): Queue {
        const existing: Queue | undefined = this.queues.get(name);
        if (existing) {
            return existing;
        }
        const created: Queue = new Queue(name, { connection: this.redis.connection, prefix: BULL_PREFIX });
        created.on('error', (error: Error) => {
            this.logs.connectionFailed(name, 'producer', error);
        });
        this.queues.set(name, created);
        return created;
    }
}
