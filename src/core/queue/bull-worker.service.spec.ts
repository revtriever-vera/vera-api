import { DiscoveryService } from '@nestjs/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueueName } from '../../shared/constants/queues.constants';
import { AlsAppContext } from '../context/als-app-context';
import { AppContext } from '../context/app-context.port';
import { TracingService } from '../observability/tracing.service';
import { QueueLogService } from './queue-log.service';
import { RedisConnection } from './redis.connection';
import { QueueHandlerPort } from './queue.types';

const SAMPLE_QUEUE: QueueName = 'sample-queue' as unknown as QueueName;

interface FakeJob {
    id: string;
    name: string;
    data: unknown;
    attemptsMade: number;
    attemptsStarted: number;
    opts: { attempts?: number };
    repeatJobKey?: string;
    moveToDelayed: ReturnType<typeof vi.fn>;
}

type Processor = (job: FakeJob) => Promise<void>;
type FailedHandler = (job: FakeJob | undefined, error: Error) => void;

const state: { processors: Processor[]; errorHandlers: ((error: Error) => void)[]; failedHandlers: FailedHandler[] } = vi.hoisted(() => ({
    processors: [],
    errorHandlers: [],
    failedHandlers: []
}));

vi.mock('bullmq', () => {
    class Worker {
        public constructor(_name: string, processor: Processor) {
            state.processors.push(processor);
        }

        public on(event: string, handler: ((error: Error) => void) | FailedHandler): void {
            if (event === 'error') {
                state.errorHandlers.push(handler as (error: Error) => void);
            }
            if (event === 'failed') {
                state.failedHandlers.push(handler as FailedHandler);
            }
        }

        public async close(): Promise<void> {
            return Promise.resolve();
        }
    }
    return { Worker };
});

class SampleHandler extends QueueHandlerPort {
    public readonly queue: QueueName = SAMPLE_QUEUE;
    public readonly type: string = 'sample.type';
    public seenLocale: string | null = null;
    public seenCompanyId: string | null = null;

    public constructor(private readonly context: AppContext) {
        super();
    }

    public async handle(): Promise<void> {
        const data = this.context.getOrNull();
        this.seenLocale = data?.locale ?? null;
        this.seenCompanyId = data?.companyId ?? null;
        return Promise.resolve();
    }
}

function discoveryWith(handlers: QueueHandlerPort[]): DiscoveryService {
    return { getProviders: () => handlers.map((instance: QueueHandlerPort) => ({ instance })) } as unknown as DiscoveryService;
}

function fakeJob(overrides: Partial<FakeJob> = {}): FakeJob {
    return {
        id: 'job-1',
        name: 'sample.type',
        data: { type: 'sample.type', requestId: 'req-1', companyId: 'company-1', occurredAt: new Date().toISOString(), trace: {} },
        attemptsMade: 0,
        attemptsStarted: 1,
        opts: { attempts: 5 },
        moveToDelayed: vi.fn(async (): Promise<void> => Promise.resolve()),
        ...overrides
    };
}

interface LogsStub {
    readonly logs: QueueLogService;
    readonly consumerStarted: ReturnType<typeof vi.fn>;
    readonly connectionFailed: ReturnType<typeof vi.fn>;
    readonly handlerMissing: ReturnType<typeof vi.fn>;
    readonly commandTicked: ReturnType<typeof vi.fn>;
    readonly jobFailed: ReturnType<typeof vi.fn>;
    readonly jobExhausted: ReturnType<typeof vi.fn>;
}

function logsStub(): LogsStub {
    const consumerStarted: ReturnType<typeof vi.fn> = vi.fn();
    const connectionFailed: ReturnType<typeof vi.fn> = vi.fn();
    const handlerMissing: ReturnType<typeof vi.fn> = vi.fn();
    const commandTicked: ReturnType<typeof vi.fn> = vi.fn();
    const jobFailed: ReturnType<typeof vi.fn> = vi.fn();
    const jobExhausted: ReturnType<typeof vi.fn> = vi.fn();
    return {
        logs: { consumerStarted, connectionFailed, handlerMissing, commandTicked, jobFailed, jobExhausted } as unknown as QueueLogService,
        consumerStarted,
        connectionFailed,
        handlerMissing,
        commandTicked,
        jobFailed,
        jobExhausted
    };
}

describe('BullWorkerService', () => {
    beforeEach(() => {
        state.processors = [];
        state.errorHandlers = [];
        state.failedHandlers = [];
    });

    it('dispatches a job to the matching handler inside a fresh AppContext', async () => {
        const { BullWorkerService } = await import('./bull-worker.service');
        const context: AppContext = new AlsAppContext();
        const handler: SampleHandler = new SampleHandler(context);
        const worker = new BullWorkerService(
            discoveryWith([handler]),
            { connection: {} } as unknown as RedisConnection,
            context,
            new TracingService(),
            logsStub().logs
        );

        worker.onApplicationBootstrap();
        await state.processors[0]?.(fakeJob({ data: { ...(fakeJob().data as Record<string, unknown>), locale: 'en' } }));

        expect(handler.seenLocale).toBe('en');
        expect(handler.seenCompanyId).toBe('company-1');
    });

    it('falls back to the default locale when the job carries none', async () => {
        const { BullWorkerService } = await import('./bull-worker.service');
        const context: AppContext = new AlsAppContext();
        const handler: SampleHandler = new SampleHandler(context);
        const worker = new BullWorkerService(
            discoveryWith([handler]),
            { connection: {} } as unknown as RedisConnection,
            context,
            new TracingService(),
            logsStub().logs
        );

        worker.onApplicationBootstrap();
        await state.processors[0]?.(fakeJob());

        expect(handler.seenLocale).toBe('pt-BR');
    });

    it('logs and skips when no handler claims the message type', async () => {
        const { BullWorkerService } = await import('./bull-worker.service');
        const context: AppContext = new AlsAppContext();
        const handler: SampleHandler = new SampleHandler(context);
        const { logs, handlerMissing } = logsStub();
        const worker = new BullWorkerService(
            discoveryWith([handler]),
            { connection: {} } as unknown as RedisConnection,
            context,
            new TracingService(),
            logs
        );

        worker.onApplicationBootstrap();
        await state.processors[0]?.(fakeJob({ name: 'other.type', data: { type: 'other.type' } }));

        expect(handlerMissing).toHaveBeenCalledWith('other.type');
    });

    it('logs a heartbeat when the job comes from a repeatable scheduler', async () => {
        const { BullWorkerService } = await import('./bull-worker.service');
        const context: AppContext = new AlsAppContext();
        const handler: SampleHandler = new SampleHandler(context);
        const { logs, commandTicked } = logsStub();
        const worker = new BullWorkerService(
            discoveryWith([handler]),
            { connection: {} } as unknown as RedisConnection,
            context,
            new TracingService(),
            logs
        );

        worker.onApplicationBootstrap();
        await state.processors[0]?.(fakeJob({ repeatJobKey: 'sample-command' }));

        expect(commandTicked).toHaveBeenCalledWith('sample-command', SAMPLE_QUEUE);
    });

    it('logs jobFailed while attempts remain and jobExhausted once they run out', async () => {
        const { BullWorkerService } = await import('./bull-worker.service');
        const context: AppContext = new AlsAppContext();
        const { logs, jobFailed, jobExhausted, connectionFailed } = logsStub();
        const worker = new BullWorkerService(
            discoveryWith([new SampleHandler(context)]),
            { connection: {} } as unknown as RedisConnection,
            context,
            new TracingService(),
            logs
        );

        worker.onApplicationBootstrap();
        const error: Error = new Error('boom');
        state.failedHandlers[0]?.(fakeJob({ attemptsMade: 1, opts: { attempts: 5 } }), error);
        state.failedHandlers[0]?.(fakeJob({ attemptsMade: 5, opts: { attempts: 5 } }), error);
        state.failedHandlers[0]?.(undefined, error);

        expect(jobFailed).toHaveBeenCalledOnce();
        expect(jobExhausted).toHaveBeenCalledOnce();
        expect(connectionFailed).toHaveBeenCalledWith(SAMPLE_QUEUE, 'consumer', error);
    });

    it('does nothing when no handler is registered for any queue', async () => {
        const { BullWorkerService } = await import('./bull-worker.service');
        const context: AppContext = new AlsAppContext();
        const worker = new BullWorkerService(
            discoveryWith([]),
            { connection: {} } as unknown as RedisConnection,
            context,
            new TracingService(),
            logsStub().logs
        );

        worker.onApplicationBootstrap();

        expect(state.processors).toHaveLength(0);
    });

    it('closes every worker on module destroy', async () => {
        const { BullWorkerService } = await import('./bull-worker.service');
        const context: AppContext = new AlsAppContext();
        const worker = new BullWorkerService(
            discoveryWith([new SampleHandler(context)]),
            { connection: {} } as unknown as RedisConnection,
            context,
            new TracingService(),
            logsStub().logs
        );

        worker.onApplicationBootstrap();

        await expect(worker.onModuleDestroy()).resolves.toBeUndefined();
    });
});
