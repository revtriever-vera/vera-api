import { Injectable, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { Job, JobSchedulerJson, Queue } from 'bullmq';
import { BULL_PREFIX, QUEUES, QueueName } from '../../shared/constants/queues.constants';
import { QueueLogService } from './queue-log.service';
import { RedisConnection } from './redis.connection';

const SAMPLE_INTERVAL_MS: number = 30_000;
const MS_PER_SECOND: number = 1000;

@Injectable()
export class QueueTelemetryService implements OnApplicationBootstrap, OnModuleDestroy {
    private readonly queues: Map<QueueName, Queue> = new Map<QueueName, Queue>();
    private timer: NodeJS.Timeout | null = null;

    public constructor(
        private readonly redis: RedisConnection,
        private readonly logs: QueueLogService
    ) {}

    public onApplicationBootstrap(): void {
        this.timer = setInterval(() => {
            void this.sample();
        }, SAMPLE_INTERVAL_MS);
        this.timer.unref();
    }

    public async onModuleDestroy(): Promise<void> {
        if (this.timer) {
            clearInterval(this.timer);
        }
        await Promise.all([...this.queues.values()].map(async (queue: Queue) => queue.close()));
    }

    public async sample(now: number = Date.now()): Promise<void> {
        for (const name of Object.values<QueueName>(QUEUES)) {
            await this.sampleQueue(name, now);
        }
    }

    private async sampleQueue(name: QueueName, now: number): Promise<void> {
        const queue: Queue = this.queueFor(name);
        await this.isolated(name, async () => {
            this.logs.oldestWaitingJobAge(name, await this.oldestWaitingAgeSeconds(queue, now));
        });
        await this.isolated(name, async () => {
            this.logs.failedJobs(name, await queue.getFailedCount());
        });
        await this.isolated(name, async () => {
            for (const scheduler of await queue.getJobSchedulers()) {
                this.reportNextRun(scheduler);
            }
        });
    }

    private async isolated(name: QueueName, read: () => Promise<void>): Promise<void> {
        try {
            await read();
        } catch (error: unknown) {
            this.logs.telemetrySampleFailed(name, error);
        }
    }

    private async oldestWaitingAgeSeconds(queue: Queue, now: number): Promise<number> {
        const [oldest]: Job[] = await queue.getJobs(['waiting', 'prioritized'], 0, 0, true);
        if (!oldest) {
            return 0;
        }
        return Math.max(0, (now - oldest.timestamp) / MS_PER_SECOND);
    }

    private reportNextRun(scheduler: JobSchedulerJson): void {
        if (scheduler.next === undefined) {
            return;
        }
        this.logs.commandNextRun(scheduler.key, scheduler.next / MS_PER_SECOND);
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
