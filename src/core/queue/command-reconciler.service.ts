import { BeforeApplicationShutdown, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';
import { JobSchedulerJson, Queue } from 'bullmq';
import { CRON_TIMEZONE } from '../../shared/constants/commands.constants';
import { BULL_PREFIX, QueueName } from '../../shared/constants/queues.constants';
import { BaseCommand } from './base.command';
import { QueueLogService } from './queue-log.service';
import { RedisConnection } from './redis.connection';
import { ScheduledEnvelope } from './queue.types';

const COMMAND_KEY_SUFFIX: string = '-command';

@Injectable()
export class CommandReconcilerService implements OnApplicationBootstrap, BeforeApplicationShutdown {
    private readonly queues: Map<QueueName, Queue> = new Map<QueueName, Queue>();

    public constructor(
        private readonly discovery: DiscoveryService,
        private readonly redis: RedisConnection,
        private readonly logs: QueueLogService
    ) {}

    public async onApplicationBootstrap(): Promise<void> {
        for (const [queue, owned] of this.groupByQueue(this.findCommands())) {
            await this.reconcile(queue, owned);
        }
    }

    public async beforeApplicationShutdown(): Promise<void> {
        await Promise.all([...this.queues.values()].map(async (queue: Queue) => queue.close()));
    }

    private findCommands(): BaseCommand[] {
        return this.discovery
            .getProviders()
            .map((wrapper: InstanceWrapper) => wrapper.instance as unknown)
            .filter((instance: unknown): instance is BaseCommand => instance instanceof BaseCommand);
    }

    private groupByQueue(commands: BaseCommand[]): Map<QueueName, BaseCommand[]> {
        const byQueue: Map<QueueName, BaseCommand[]> = new Map<QueueName, BaseCommand[]>();
        for (const command of commands) {
            byQueue.set(command.queue, [...(byQueue.get(command.queue) ?? []), command]);
        }
        return byQueue;
    }

    private async reconcile(name: QueueName, commands: BaseCommand[]): Promise<void> {
        const queue: Queue = this.queueFor(name);
        for (const command of commands) {
            await this.upsert(queue, command);
        }
        await this.removeOrphans(queue, new Set(commands.map((command: BaseCommand) => command.key)));
    }

    private async upsert(queue: Queue, command: BaseCommand): Promise<void> {
        const envelope: ScheduledEnvelope = { type: command.type, companyId: null, payload: command.payload };
        try {
            await queue.upsertJobScheduler(
                command.key,
                { pattern: command.pattern, tz: CRON_TIMEZONE },
                { name: command.type, data: envelope }
            );
            this.logs.commandScheduled(command.key, command.queue, command.type, command.pattern);
        } catch (error: unknown) {
            this.logs.commandRegistrationFailed(command.key, command.queue, error);
        }
    }

    private async removeOrphans(queue: Queue, declared: Set<string>): Promise<void> {
        const existing: JobSchedulerJson[] = await queue.getJobSchedulers();
        for (const scheduler of existing) {
            if (!scheduler.key.endsWith(COMMAND_KEY_SUFFIX) || declared.has(scheduler.key)) {
                continue;
            }
            await queue.removeJobScheduler(scheduler.key);
            this.logs.commandOrphanRemoved(scheduler.key, queue.name as QueueName);
        }
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
