import { DiscoveryService } from '@nestjs/core';
import { Queue } from 'bullmq';
import { afterAll, afterEach, beforeAll, describe, expect, inject, it, vi } from 'vitest';
import { BaseCommand } from '@src/core/queue/base.command';
import { CommandReconcilerService } from '@src/core/queue/command-reconciler.service';
import { QueueLogService } from '@src/core/queue/queue-log.service';
import { RedisConnection } from '@src/core/queue/redis.connection';
import { bullPrefixFromEnvironment } from '@src/shared/config/bull-prefix';
import { QueueName } from '@src/shared/constants/queues.constants';
import { isolateRedisForWorker } from './support/queue';

const QUEUE: QueueName = 'command-reconciler-spec' as QueueName;
const EVERY_FIVE_MINUTES = '*/5 * * * *';

class SpecCommand extends BaseCommand {
    public readonly key: never;
    public readonly queue: QueueName = QUEUE;
    public readonly type: string;
    public readonly pattern: string;

    public constructor(key: string, type: string, pattern: string = EVERY_FIVE_MINUTES) {
        super();
        this.key = key as never;
        this.type = type;
        this.pattern = pattern;
    }
}

describe('command reconciler against a real Redis', () => {
    let redis: RedisConnection;
    let inspector: Queue;
    const services: CommandReconcilerService[] = [];
    const logs = {
        commandScheduled: vi.fn(),
        commandRegistrationFailed: vi.fn(),
        commandOrphanRemoved: vi.fn(),
        connectionFailed: vi.fn()
    };

    async function reconcile(commands: BaseCommand[]): Promise<void> {
        const discovery = { getProviders: () => commands.map((instance: BaseCommand) => ({ instance })) } as unknown as DiscoveryService;
        const service = new CommandReconcilerService(discovery, redis, logs as unknown as QueueLogService);
        services.push(service);
        await service.onApplicationBootstrap();
    }

    beforeAll(async () => {
        await isolateRedisForWorker(inject('redisNode'));
        redis = new RedisConnection();
        inspector = new Queue(QUEUE, { connection: redis.connection, prefix: bullPrefixFromEnvironment() });
    });

    afterEach(async () => {
        await Promise.all(services.splice(0).map(async (service: CommandReconcilerService) => service.beforeApplicationShutdown()));
        for (const scheduler of await inspector.getJobSchedulers()) {
            await inspector.removeJobScheduler(scheduler.key);
        }
        vi.clearAllMocks();
    });

    afterAll(async () => {
        await inspector.close();
        await redis.onApplicationShutdown();
    });

    it('registers each command as a repeatable scheduler with the São Paulo time zone and a company-less envelope', async () => {
        await reconcile([new SpecCommand('alpha-command', 'alpha.tick')]);

        const schedulers = await inspector.getJobSchedulers();
        expect(schedulers).toHaveLength(1);
        expect(schedulers[0]).toMatchObject({
            key: 'alpha-command',
            name: 'alpha.tick',
            pattern: EVERY_FIVE_MINUTES,
            tz: 'America/Sao_Paulo',
            template: { data: { type: 'alpha.tick', companyId: null, payload: {} } }
        });
        expect(logs.commandScheduled).toHaveBeenCalledWith('alpha-command', QUEUE, 'alpha.tick', EVERY_FIVE_MINUTES);
    });

    it('is idempotent when the same commands are reconciled again', async () => {
        await reconcile([new SpecCommand('alpha-command', 'alpha.tick')]);
        await reconcile([new SpecCommand('alpha-command', 'alpha.tick')]);

        expect(await inspector.getJobSchedulers()).toHaveLength(1);
        expect(logs.commandOrphanRemoved).not.toHaveBeenCalled();
    });

    it('removes only orphan schedulers ending in -command and keeps declared and foreign ones', async () => {
        await reconcile([new SpecCommand('alpha-command', 'alpha.tick'), new SpecCommand('beta-command', 'beta.tick')]);
        await inspector.upsertJobScheduler('manual-schedule', { pattern: EVERY_FIVE_MINUTES }, { name: 'manual', data: {} });

        await reconcile([new SpecCommand('alpha-command', 'alpha.tick')]);

        const keys = (await inspector.getJobSchedulers()).map((scheduler) => scheduler.key).sort();
        expect(keys).toEqual(['alpha-command', 'manual-schedule']);
        expect(logs.commandOrphanRemoved).toHaveBeenCalledTimes(1);
        expect(logs.commandOrphanRemoved).toHaveBeenCalledWith('beta-command', QUEUE);
    });

    it('isolates a command that fails to register and still registers the others', async () => {
        await reconcile([new SpecCommand('broken-command', 'broken.tick', 'not a cron'), new SpecCommand('alpha-command', 'alpha.tick')]);

        const keys = (await inspector.getJobSchedulers()).map((scheduler) => scheduler.key);
        expect(keys).toEqual(['alpha-command']);
        expect(logs.commandRegistrationFailed).toHaveBeenCalledTimes(1);
        expect(logs.commandRegistrationFailed.mock.calls[0]?.slice(0, 2)).toEqual(['broken-command', QUEUE]);
        expect(logs.commandScheduled).toHaveBeenCalledTimes(1);
    });
});
