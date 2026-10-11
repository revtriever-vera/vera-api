import { describe, expect, it, vi } from 'vitest';
import { QueueName } from '../../shared/constants/queues.constants';
import { LogService } from '../observability/log.service';
import { MetricsService } from '../observability/metrics.service';
import { QueueLogService } from './queue-log.service';

const SAMPLE_QUEUE: QueueName = 'sample-queue' as unknown as QueueName;

interface Harness {
    readonly logs: QueueLogService;
    readonly metrics: MetricsService;
    readonly count: ReturnType<typeof vi.fn>;
    readonly info: ReturnType<typeof vi.fn>;
    readonly warn: ReturnType<typeof vi.fn>;
    readonly error: ReturnType<typeof vi.fn>;
}

function harness(): Harness {
    const info: ReturnType<typeof vi.fn> = vi.fn();
    const warn: ReturnType<typeof vi.fn> = vi.fn();
    const error: ReturnType<typeof vi.fn> = vi.fn();
    const count: ReturnType<typeof vi.fn> = vi.fn();
    const metrics: MetricsService = new MetricsService();
    metrics.count = count;
    const logService: LogService = { info, warn, error, debug: vi.fn() } as unknown as LogService;
    return { logs: new QueueLogService(logService, metrics), metrics, count, info, warn, error };
}

describe('QueueLogService telemetry', () => {
    it('counts a heartbeat per command tick and logs it with the queue', () => {
        const { logs, count, info }: Harness = harness();

        logs.commandTicked('sample-command', SAMPLE_QUEUE);

        expect(count).toHaveBeenCalledWith('scheduled_command_heartbeat_total', { command: 'sample-command' });
        expect(info).toHaveBeenCalledWith(
            expect.objectContaining({ identifier: 'queue-consumer', meta: { command: 'sample-command', queue: SAMPLE_QUEUE } })
        );
    });

    it('exposes the next run and the oldest waiting job age as gauges', () => {
        const { logs, metrics }: Harness = harness();

        logs.commandNextRun('sample-command', 1_800_000_000);
        logs.oldestWaitingJobAge(SAMPLE_QUEUE, 42);

        expect(metrics.gaugeValue('scheduled_command_next_run_timestamp_seconds', { command: 'sample-command' })).toBe(1_800_000_000);
        expect(metrics.gaugeValue('queue_oldest_waiting_job_age_seconds', { queue: SAMPLE_QUEUE })).toBe(42);
    });

    it('warns with the queue and the detail when a telemetry sample fails', () => {
        const { logs, warn }: Harness = harness();

        logs.telemetrySampleFailed(SAMPLE_QUEUE, new Error('redis away'));

        expect(warn).toHaveBeenCalledWith(expect.objectContaining({ meta: { queue: SAMPLE_QUEUE, detail: 'redis away' } }));
    });

    it('logs consumer lifecycle and enqueue outcomes', () => {
        const { logs, info, error, warn }: Harness = harness();

        logs.consumerStarted(SAMPLE_QUEUE);
        logs.enqueueFailed(SAMPLE_QUEUE, 'sample.type', new Error('down'));
        logs.handlerMissing('sample.type');
        logs.connectionFailed(SAMPLE_QUEUE, 'producer', new Error('down'));
        logs.enqueueSkippedRunning(SAMPLE_QUEUE, 'sample.type', 'job-1');
        logs.jobFailed(SAMPLE_QUEUE, 'job-1', 'sample.type', 1, 5, new Error('retry'));
        logs.jobExhausted(SAMPLE_QUEUE, 'job-1', 'sample.type', 5, new Error('gave up'));
        logs.commandScheduled('sample-command', SAMPLE_QUEUE, 'sample.type', '*/5 * * * *');
        logs.commandOrphanRemoved('sample-command', SAMPLE_QUEUE);
        logs.commandRegistrationFailed('sample-command', SAMPLE_QUEUE, 'not an error');

        expect(info).toHaveBeenCalledTimes(3);
        expect(error).toHaveBeenCalledTimes(5);
        expect(warn).toHaveBeenCalledTimes(2);
    });
});
