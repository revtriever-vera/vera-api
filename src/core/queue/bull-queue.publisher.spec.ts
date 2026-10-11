import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AlsAppContext } from '../context/als-app-context';
import { AppContext } from '../context/app-context.port';
import { DatabaseClient } from '../database/database.client';
import { TracingService } from '../observability/tracing.service';
import { QueueName } from '../../shared/constants/queues.constants';
import { QueueLogService } from './queue-log.service';
import { RedisConnection } from './redis.connection';
import { PublishOptions } from './queue.types';

const SAMPLE_QUEUE: QueueName = 'sample-queue' as unknown as QueueName;

interface AddedJob {
    readonly name: string;
    readonly envelope: unknown;
    readonly opts: Record<string, unknown>;
}

interface JobStub {
    readonly isActive: () => Promise<boolean>;
    readonly isFailed?: () => Promise<boolean>;
    readonly remove: () => Promise<void>;
}

const state: { added: AddedJob[]; jobs: Map<string, JobStub> } = vi.hoisted(() => ({
    added: [] as AddedJob[],
    jobs: new Map<string, JobStub>()
}));

vi.mock('bullmq', () => {
    class Queue {
        public readonly name: string;
        public constructor(name: string) {
            this.name = name;
        }

        public on(): void {
            return undefined;
        }

        public async add(name: string, envelope: unknown, opts: Record<string, unknown>): Promise<void> {
            state.added.push({ name, envelope, opts });
            return Promise.resolve();
        }

        public async getJob(jobId: string): Promise<JobStub | undefined> {
            return Promise.resolve(state.jobs.get(jobId));
        }

        public async close(): Promise<void> {
            return Promise.resolve();
        }
    }
    return { Queue };
});

function fakeDatabaseClient(): { client: DatabaseClient; flush: () => Promise<void> } {
    const pending: (() => Promise<void>)[] = [];
    const client: DatabaseClient = {
        afterCommit: async (callback: () => Promise<void>): Promise<void> => {
            pending.push(callback);
            return Promise.resolve();
        }
    } as unknown as DatabaseClient;
    return {
        client,
        flush: async (): Promise<void> => {
            for (const callback of pending) {
                await callback();
            }
        }
    };
}

function fakeLogs(): { logs: QueueLogService; enqueueSkippedRunning: ReturnType<typeof vi.fn> } {
    const enqueueSkippedRunning: ReturnType<typeof vi.fn> = vi.fn();
    return {
        logs: {
            enqueueSkippedRunning,
            enqueueFailed: vi.fn(),
            connectionFailed: vi.fn()
        } as unknown as QueueLogService,
        enqueueSkippedRunning
    };
}

async function publisherOf(): Promise<{
    publish: (type: string, payload: unknown, options?: PublishOptions) => Promise<void>;
    flush: () => Promise<void>;
    enqueueSkippedRunning: ReturnType<typeof vi.fn>;
}> {
    const { BullQueuePublisher } = await import('./bull-queue.publisher');
    const context: AppContext = new AlsAppContext();
    const { client, flush } = fakeDatabaseClient();
    const { logs, enqueueSkippedRunning } = fakeLogs();
    const redis: RedisConnection = { connection: {} } as unknown as RedisConnection;
    const publisher = new BullQueuePublisher(redis, context, new TracingService(), client, logs);
    return {
        publish: async (type: string, payload: unknown, options?: PublishOptions): Promise<void> =>
            context.run({ requestId: 'req-1', companyId: 'company-1', locale: 'pt-BR' }, async () =>
                publisher.publish(SAMPLE_QUEUE, type, payload, options)
            ),
        flush,
        enqueueSkippedRunning
    };
}

describe('BullQueuePublisher', () => {
    beforeEach(() => {
        state.added = [];
        state.jobs.clear();
    });

    it('publishes only after the database commit runs, not at the call site', async () => {
        const { publish, flush } = await publisherOf();

        await publish('sample.type', { id: '1' });
        expect(state.added).toHaveLength(0);

        await flush();
        expect(state.added).toHaveLength(1);
    });

    it('passes jobId to Queue.add exactly as given', async () => {
        const { publish, flush } = await publisherOf();

        await publish('sample.type', { id: '1' }, { jobId: 'sample-job-1' });
        await flush();

        expect(state.added[0]?.opts.jobId).toBe('sample-job-1');
    });

    it('removes a non-active superseded job before re-enqueueing under replaceExisting', async () => {
        const remove: ReturnType<typeof vi.fn> = vi.fn(async (): Promise<void> => Promise.resolve());
        state.jobs.set('sample-job-1', { isActive: async (): Promise<boolean> => Promise.resolve(false), remove });
        const { publish, flush } = await publisherOf();

        await publish('sample.type', { id: '1' }, { jobId: 'sample-job-1', replaceExisting: true });
        await flush();

        expect(remove).toHaveBeenCalledOnce();
        expect(state.added).toHaveLength(1);
    });

    it('skips re-enqueueing when the superseded job is still active', async () => {
        const remove: ReturnType<typeof vi.fn> = vi.fn();
        state.jobs.set('sample-job-1', { isActive: async (): Promise<boolean> => Promise.resolve(true), remove });
        const { publish, flush, enqueueSkippedRunning } = await publisherOf();

        await publish('sample.type', { id: '1' }, { jobId: 'sample-job-1', replaceExisting: true });
        await flush();

        expect(remove).not.toHaveBeenCalled();
        expect(state.added).toHaveLength(0);
        expect(enqueueSkippedRunning).toHaveBeenCalledOnce();
    });

    it('removes a failed job before re-enqueueing under retryFailed', async () => {
        const remove: ReturnType<typeof vi.fn> = vi.fn(async (): Promise<void> => Promise.resolve());
        state.jobs.set('sample-job-1', {
            isActive: async (): Promise<boolean> => Promise.resolve(false),
            isFailed: async (): Promise<boolean> => Promise.resolve(true),
            remove
        });
        const { publish, flush } = await publisherOf();

        await publish('sample.type', { id: '1' }, { jobId: 'sample-job-1', retryFailed: true });
        await flush();

        expect(remove).toHaveBeenCalledOnce();
        expect(state.added).toHaveLength(1);
    });

    it('keeps a pending or successfully completed job untouched under retryFailed', async () => {
        const remove: ReturnType<typeof vi.fn> = vi.fn();
        state.jobs.set('sample-job-1', {
            isActive: async (): Promise<boolean> => Promise.resolve(false),
            isFailed: async (): Promise<boolean> => Promise.resolve(false),
            remove
        });
        const { publish, flush } = await publisherOf();

        await publish('sample.type', { id: '1' }, { jobId: 'sample-job-1', retryFailed: true });
        await flush();

        expect(remove).not.toHaveBeenCalled();
        expect(state.added).toHaveLength(1);
        expect(state.added[0]?.opts.jobId).toBe('sample-job-1');
    });

    it('enqueues normally under retryFailed when there is no previous job', async () => {
        const { publish, flush } = await publisherOf();

        await publish('sample.type', { id: '1' }, { jobId: 'sample-job-1', retryFailed: true });
        await flush();

        expect(state.added).toHaveLength(1);
    });
});
