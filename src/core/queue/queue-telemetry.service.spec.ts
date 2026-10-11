import { describe, expect, it, vi } from 'vitest';
import { QUEUES } from '../../shared/constants/queues.constants';
import { QueueLogService } from './queue-log.service';
import { QueueTelemetryService } from './queue-telemetry.service';
import { RedisConnection } from './redis.connection';

const FAILED_COUNT: number = 4;
const queueMock: {
    getFailedCount: ReturnType<typeof vi.fn>;
    getJobs: ReturnType<typeof vi.fn>;
    getJobSchedulers: ReturnType<typeof vi.fn>;
} = vi.hoisted(() => ({ getFailedCount: vi.fn(), getJobs: vi.fn(), getJobSchedulers: vi.fn() }));

vi.mock('bullmq', () => ({
    Queue: class {
        public readonly getFailedCount: typeof queueMock.getFailedCount = queueMock.getFailedCount;
        public readonly getJobs: typeof queueMock.getJobs = queueMock.getJobs;
        public readonly getJobSchedulers: typeof queueMock.getJobSchedulers = queueMock.getJobSchedulers;
        public readonly on: () => void = vi.fn();
        public readonly close: () => Promise<void> = vi.fn().mockResolvedValue(undefined);
    }
}));

function harness(): { service: QueueTelemetryService; logs: Record<string, ReturnType<typeof vi.fn>> } {
    const logs: Record<string, ReturnType<typeof vi.fn>> = {
        oldestWaitingJobAge: vi.fn(),
        failedJobs: vi.fn(),
        commandNextRun: vi.fn(),
        telemetrySampleFailed: vi.fn(),
        connectionFailed: vi.fn()
    };
    const redis: RedisConnection = { connection: {} } as unknown as RedisConnection;
    return { service: new QueueTelemetryService(redis, logs as unknown as QueueLogService), logs };
}

describe('QueueTelemetryService', () => {
    it('reports the failed job count of every queue', async () => {
        queueMock.getFailedCount.mockResolvedValue(FAILED_COUNT);
        queueMock.getJobs.mockResolvedValue([]);
        queueMock.getJobSchedulers.mockResolvedValue([]);
        const { service, logs } = harness();

        await service.sample();

        for (const name of Object.values(QUEUES)) {
            expect(logs['failedJobs']).toHaveBeenCalledWith(name, FAILED_COUNT);
        }
    });

    it('logs a sample failure instead of throwing when the count cannot be read', async () => {
        queueMock.getFailedCount.mockRejectedValue(new Error('redis away'));
        queueMock.getJobs.mockResolvedValue([]);
        const { service, logs } = harness();

        await expect(service.sample()).resolves.toBeUndefined();

        expect(logs['telemetrySampleFailed']).toHaveBeenCalled();
    });

    it('keeps reporting next runs when the failed count cannot be read', async () => {
        const NEXT_MS: number = 5000;
        queueMock.getFailedCount.mockRejectedValue(new Error('redis away'));
        queueMock.getJobs.mockResolvedValue([]);
        queueMock.getJobSchedulers.mockResolvedValue([{ key: 'cmd', next: NEXT_MS }]);
        const { service, logs } = harness();

        await service.sample();

        expect(logs['commandNextRun']).toHaveBeenCalledWith('cmd', NEXT_MS / 1000);
        expect(logs['oldestWaitingJobAge']).toHaveBeenCalled();
        expect(logs['failedJobs']).not.toHaveBeenCalled();
        expect(logs['telemetrySampleFailed']).toHaveBeenCalled();
    });

    it('reports the age in seconds of the oldest waiting job', async () => {
        const NOW: number = 100_000;
        const WAITED_MS: number = 30_000;
        queueMock.getFailedCount.mockResolvedValue(0);
        queueMock.getJobs.mockResolvedValue([{ timestamp: NOW - WAITED_MS }]);
        queueMock.getJobSchedulers.mockResolvedValue([]);
        const { service, logs } = harness();

        await service.sample(NOW);

        expect(logs['oldestWaitingJobAge']).toHaveBeenCalledWith(Object.values(QUEUES)[0], WAITED_MS / 1000);
    });

    it('skips schedulers that have no next run', async () => {
        queueMock.getFailedCount.mockResolvedValue(0);
        queueMock.getJobs.mockResolvedValue([]);
        queueMock.getJobSchedulers.mockResolvedValue([{ key: 'cmd' }]);
        const { service, logs } = harness();

        await service.sample();

        expect(logs['commandNextRun']).not.toHaveBeenCalled();
    });

    it('samples on an interval after bootstrap and stops on destroy', async () => {
        vi.useFakeTimers();
        queueMock.getFailedCount.mockResolvedValue(0);
        queueMock.getJobs.mockResolvedValue([]);
        queueMock.getJobSchedulers.mockResolvedValue([]);
        const { service, logs } = harness();

        service.onApplicationBootstrap();
        await vi.advanceTimersByTimeAsync(30_000);
        const calls: number = logs['failedJobs']?.mock.calls.length ?? 0;
        await service.onModuleDestroy();
        await vi.advanceTimersByTimeAsync(60_000);
        vi.useRealTimers();

        expect(calls).toBeGreaterThan(0);
        expect(logs['failedJobs']?.mock.calls.length).toBe(calls);
    });
});
