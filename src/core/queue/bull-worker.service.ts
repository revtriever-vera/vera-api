import { Injectable, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';
import { Job, Worker } from 'bullmq';
import { v7 as uuidV7 } from 'uuid';
import { AppLocale, DEFAULT_LOCALE } from '../../shared/i18n/locale';
import { BULL_PREFIX, QueueName } from '../../shared/constants/queues.constants';
import { AppContext } from '../context/app-context.port';
import { TracingService } from '../observability/tracing.service';
import { QueueLogService } from './queue-log.service';
import { RedisConnection } from './redis.connection';
import { QueueEnvelope, QueueHandlerPort } from './queue.types';

const CONCURRENCY: number = 5;

@Injectable()
export class BullWorkerService implements OnApplicationBootstrap, OnModuleDestroy {
    private readonly workers: Worker[] = [];

    public constructor(
        private readonly discovery: DiscoveryService,
        private readonly redis: RedisConnection,
        private readonly context: AppContext,
        private readonly tracing: TracingService,
        private readonly logs: QueueLogService
    ) {}

    public onApplicationBootstrap(): void {
        for (const [queue, handlers] of this.groupByQueue(this.findHandlers())) {
            this.startWorker(queue, handlers);
        }
    }

    public async onModuleDestroy(): Promise<void> {
        await Promise.all(this.workers.map(async (worker: Worker) => worker.close()));
    }

    private findHandlers(): QueueHandlerPort[] {
        return this.discovery
            .getProviders()
            .map((wrapper: InstanceWrapper) => wrapper.instance as unknown)
            .filter((instance: unknown): instance is QueueHandlerPort => instance instanceof QueueHandlerPort);
    }

    private groupByQueue(handlers: QueueHandlerPort[]): Map<QueueName, QueueHandlerPort[]> {
        const byQueue: Map<QueueName, QueueHandlerPort[]> = new Map<QueueName, QueueHandlerPort[]>();
        for (const handler of handlers) {
            byQueue.set(handler.queue, [...(byQueue.get(handler.queue) ?? []), handler]);
        }
        return byQueue;
    }

    private startWorker(queue: QueueName, handlers: QueueHandlerPort[]): void {
        const worker: Worker = new Worker(queue, async (job: Job) => this.dispatch(queue, handlers, job), {
            connection: this.redis.connection,
            prefix: BULL_PREFIX,
            concurrency: CONCURRENCY
        });
        worker.on('error', (error: Error) => {
            this.logs.connectionFailed(queue, 'consumer', error);
        });
        worker.on('failed', (job: Job | undefined, error: Error) => {
            this.onFailed(queue, job, error);
        });
        this.workers.push(worker);
        this.logs.consumerStarted(queue);
    }

    private onFailed(queue: QueueName, job: Job | undefined, error: Error): void {
        if (!job) {
            this.logs.connectionFailed(queue, 'consumer', error);
            return;
        }
        const maxAttempts: number = job.opts.attempts ?? 1;
        const type: string = (job.data as QueueEnvelope | undefined)?.type ?? job.name;
        if (job.attemptsMade >= maxAttempts) {
            this.logs.jobExhausted(queue, String(job.id), type, maxAttempts, error);
            return;
        }
        this.logs.jobFailed(queue, String(job.id), type, job.attemptsMade, maxAttempts, error);
    }

    private envelopeOf(job: Job): QueueEnvelope {
        const stored: Partial<QueueEnvelope> = job.data as Partial<QueueEnvelope>;
        return {
            type: stored.type ?? job.name,
            requestId: stored.requestId ?? uuidV7(),
            companyId: stored.companyId ?? null,
            occurredAt: stored.occurredAt ?? new Date().toISOString(),
            trace: stored.trace ?? {},
            payload: stored.payload ?? {}
        };
    }

    private localeOf(job: Job): AppLocale {
        const locale: unknown = (job.data as { locale?: unknown } | undefined)?.locale;
        return locale === 'pt-BR' || locale === 'en' ? locale : DEFAULT_LOCALE;
    }

    private jobContextOf(
        job: Job,
        envelope: QueueEnvelope
    ): {
        requestId: string;
        companyId: string | undefined;
        locale: AppLocale;
    } {
        return {
            requestId: envelope.requestId,
            companyId: envelope.companyId ?? undefined,
            locale: this.localeOf(job)
        };
    }

    private async dispatch(queue: QueueName, handlers: QueueHandlerPort[], job: Job): Promise<void> {
        const envelope: QueueEnvelope = this.envelopeOf(job);
        const handler: QueueHandlerPort | undefined = handlers.find((candidate: QueueHandlerPort) => candidate.type === envelope.type);
        if (!handler) {
            this.logs.handlerMissing(envelope.type);
            return;
        }
        if (job.repeatJobKey !== undefined) {
            this.logs.commandTicked(job.repeatJobKey, queue);
        }
        await this.tracing.continueFrom(envelope.trace, `queue ${queue}`, { 'queue.name': queue, 'queue.type': envelope.type }, async () =>
            this.context.run(this.jobContextOf(job, envelope), async () =>
                handler.handle(envelope, {
                    id: String(job.id),
                    attemptsStarted: job.attemptsStarted,
                    maxAttempts: job.opts.attempts ?? 1,
                    moveToDelayed: async (at: number) => job.moveToDelayed(at)
                })
            )
        );
    }
}
