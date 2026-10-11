import { Injectable } from '@nestjs/common';
import { QueueName } from '../../shared/constants/queues.constants';
import { LogService } from '../observability/log.service';
import { MetricsService } from '../observability/metrics.service';

const LOG_IDENTIFIER: string = 'queue-consumer';
const HEARTBEAT_METRIC: string = 'scheduled_command_heartbeat_total';
const NEXT_RUN_METRIC: string = 'scheduled_command_next_run_timestamp_seconds';
const OLDEST_WAITING_METRIC: string = 'queue_oldest_waiting_job_age_seconds';

@Injectable()
export class QueueLogService {
    public constructor(
        private readonly logService: LogService,
        private readonly metrics: MetricsService
    ) {}

    public commandTicked(command: string, queue: QueueName): void {
        this.metrics.count(HEARTBEAT_METRIC, { command });
        this.logService.info({ message: 'scheduled command ticked', identifier: LOG_IDENTIFIER, meta: { command, queue } });
    }

    public commandNextRun(command: string, nextRunEpochSeconds: number): void {
        this.metrics.gauge(NEXT_RUN_METRIC, nextRunEpochSeconds, { command });
    }

    public oldestWaitingJobAge(queue: QueueName, ageSeconds: number): void {
        this.metrics.gauge(OLDEST_WAITING_METRIC, ageSeconds, { queue });
    }

    public telemetrySampleFailed(queue: QueueName, error: unknown): void {
        this.logService.warn({
            message: 'queue telemetry sample failed',
            identifier: LOG_IDENTIFIER,
            meta: { queue, detail: this.detailOf(error) }
        });
    }

    public consumerStarted(queue: QueueName): void {
        this.logService.info({ message: 'queue consumer started', identifier: LOG_IDENTIFIER, meta: { queue } });
    }

    public enqueueFailed(queue: QueueName, type: string, error: unknown): void {
        this.logService.error({
            message: 'failed to enqueue job',
            identifier: LOG_IDENTIFIER,
            meta: { queue, type, detail: error instanceof Error ? error.message : String(error) }
        });
    }

    public handlerMissing(type: string): void {
        this.logService.error({ message: 'no handler for message type', identifier: LOG_IDENTIFIER, meta: { type } });
    }

    public connectionFailed(queue: QueueName, side: 'producer' | 'consumer', error: unknown): void {
        this.logService.error({
            message: 'queue connection error',
            identifier: LOG_IDENTIFIER,
            meta: { queue, side, detail: this.detailOf(error) }
        });
    }

    public enqueueSkippedRunning(queue: QueueName, type: string, jobId: string): void {
        this.logService.info({
            message: 'queue job not republished, the previous one is still running',
            identifier: LOG_IDENTIFIER,
            meta: { queue, type, jobId }
        });
    }

    public jobFailed(queue: QueueName, jobId: string, type: string, attempt: number, maxAttempts: number, error: unknown): void {
        this.logService.warn({
            message: 'queue job attempt failed',
            identifier: LOG_IDENTIFIER,
            meta: { queue, jobId, type, attempt, maxAttempts, detail: this.detailOf(error) }
        });
    }

    public jobExhausted(queue: QueueName, jobId: string, type: string, maxAttempts: number, error: unknown): void {
        this.logService.error({
            message: 'queue job exhausted its attempts and was abandoned',
            identifier: LOG_IDENTIFIER,
            meta: { queue, jobId, type, maxAttempts, detail: this.detailOf(error) }
        });
    }

    public commandScheduled(key: string, queue: QueueName, type: string, pattern: string): void {
        this.logService.info({ message: 'cron command scheduled', identifier: LOG_IDENTIFIER, meta: { key, queue, type, pattern } });
    }

    public commandOrphanRemoved(key: string, queue: QueueName): void {
        this.logService.warn({ message: 'orphan cron command removed', identifier: LOG_IDENTIFIER, meta: { key, queue } });
    }

    public commandRegistrationFailed(key: string, queue: QueueName, error: unknown): void {
        this.logService.error({
            message: 'failed to register cron command',
            identifier: LOG_IDENTIFIER,
            meta: { key, queue, detail: this.detailOf(error) }
        });
    }

    private detailOf(error: unknown): string {
        return error instanceof Error ? error.message : String(error);
    }
}
