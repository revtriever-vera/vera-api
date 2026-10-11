import { DiscoveryService } from '@nestjs/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueueName } from '../../shared/constants/queues.constants';
import { BaseCommand } from './base.command';
import { CommandReconcilerService } from './command-reconciler.service';
import { QueueLogService } from './queue-log.service';
import { RedisConnection } from './redis.connection';

interface QueueDouble {
    readonly name: string;
    readonly upsertJobScheduler: ReturnType<typeof vi.fn>;
    readonly getJobSchedulers: ReturnType<typeof vi.fn>;
    readonly removeJobScheduler: ReturnType<typeof vi.fn>;
    readonly close: ReturnType<typeof vi.fn>;
    readonly handlers: Map<string, (error: Error) => void>;
    readonly options: unknown;
}

const created: { queues: QueueDouble[]; schedulers: Map<string, Array<{ key: string }>> } = vi.hoisted(() => ({
    queues: [] as QueueDouble[],
    schedulers: new Map<string, Array<{ key: string }>>()
}));

vi.mock('bullmq', () => {
    class Queue {
        public readonly name: string;
        public readonly options: unknown;
        public readonly handlers: Map<string, (error: Error) => void> = new Map<string, (error: Error) => void>();
        public readonly upsertJobScheduler: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(undefined);
        public readonly removeJobScheduler: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(true);
        public readonly close: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(undefined);
        public readonly getJobSchedulers: ReturnType<typeof vi.fn>;

        public constructor(name: string, options: unknown) {
            this.name = name;
            this.options = options;
            this.getJobSchedulers = vi.fn().mockImplementation(async () => Promise.resolve(created.schedulers.get(name) ?? []));
            created.queues.push(this);
        }

        public on(event: string, handler: (error: Error) => void): void {
            this.handlers.set(event, handler);
        }
    }
    return { Queue };
});

class FakeCommand extends BaseCommand {
    public readonly key: never;
    public readonly queue: QueueName;
    public readonly type: string;
    public readonly pattern: string = '*/5 * * * *';

    public constructor(key: string, queue: string, type: string = 'sample.tick') {
        super();
        this.key = key as never;
        this.queue = queue as QueueName;
        this.type = type;
    }
}

function build(
    commands: BaseCommand[],
    extraProviders: unknown[] = []
): {
    service: CommandReconcilerService;
    logs: Record<string, ReturnType<typeof vi.fn>>;
} {
    const providers: Array<{ instance: unknown }> = [...commands, ...extraProviders].map((instance: unknown) => ({ instance }));
    const discovery: DiscoveryService = { getProviders: () => providers } as unknown as DiscoveryService;
    const redis: RedisConnection = { connection: { marker: 'redis' } } as unknown as RedisConnection;
    const logs: Record<string, ReturnType<typeof vi.fn>> = {
        commandScheduled: vi.fn(),
        commandRegistrationFailed: vi.fn(),
        commandOrphanRemoved: vi.fn(),
        connectionFailed: vi.fn()
    };
    return { service: new CommandReconcilerService(discovery, redis, logs as unknown as QueueLogService), logs };
}

describe('CommandReconcilerService', () => {
    beforeEach(() => {
        created.queues.length = 0;
        created.schedulers.clear();
    });

    it('agenda cada comando descoberto com o envelope sem empresa e o fuso de São Paulo', async () => {
        const { service, logs } = build([new FakeCommand('a-command', 'queue-a', 'a.tick')]);

        await service.onApplicationBootstrap();

        const queue = created.queues[0] as QueueDouble;
        expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
            'a-command',
            { pattern: '*/5 * * * *', tz: 'America/Sao_Paulo' },
            { name: 'a.tick', data: { type: 'a.tick', companyId: null, payload: {} } }
        );
        expect(logs['commandScheduled']).toHaveBeenCalledWith('a-command', 'queue-a', 'a.tick', '*/5 * * * *');
    });

    it('ignora provedores que não são comandos', async () => {
        const { service } = build([], [{ other: true }, null, 'texto']);

        await service.onApplicationBootstrap();

        expect(created.queues).toHaveLength(0);
    });

    it('reaproveita a mesma fila para comandos da mesma fila e abre uma por fila distinta', async () => {
        const { service } = build([
            new FakeCommand('a-command', 'queue-a'),
            new FakeCommand('b-command', 'queue-a'),
            new FakeCommand('c-command', 'queue-b')
        ]);

        await service.onApplicationBootstrap();

        expect(created.queues.map((queue: QueueDouble) => queue.name)).toEqual(['queue-a', 'queue-b']);
        expect(created.queues[0]?.upsertJobScheduler).toHaveBeenCalledTimes(2);
    });

    it('registra a falha de um comando e segue para os demais', async () => {
        const { service, logs } = build([new FakeCommand('a-command', 'queue-a'), new FakeCommand('b-command', 'queue-a')]);
        const boom = new Error('redis down');
        await service.onApplicationBootstrap();
        const queue = created.queues[0] as QueueDouble;
        queue.upsertJobScheduler.mockReset();
        queue.upsertJobScheduler.mockRejectedValueOnce(boom).mockResolvedValue(undefined);
        logs['commandScheduled']?.mockClear();

        await service.onApplicationBootstrap();

        expect(logs['commandRegistrationFailed']).toHaveBeenCalledWith('a-command', 'queue-a', boom);
        expect(logs['commandScheduled']).toHaveBeenCalledTimes(1);
        expect(logs['commandScheduled']).toHaveBeenCalledWith('b-command', 'queue-a', 'sample.tick', '*/5 * * * *');
    });

    it('remove só agendadores órfãos com sufixo -command e preserva os declarados e os de outra origem', async () => {
        created.schedulers.set('queue-a', [{ key: 'a-command' }, { key: 'old-command' }, { key: 'manual-schedule' }]);
        const { service, logs } = build([new FakeCommand('a-command', 'queue-a')]);

        await service.onApplicationBootstrap();

        const queue = created.queues[0] as QueueDouble;
        expect(queue.removeJobScheduler).toHaveBeenCalledTimes(1);
        expect(queue.removeJobScheduler).toHaveBeenCalledWith('old-command');
        expect(logs['commandOrphanRemoved']).toHaveBeenCalledWith('old-command', 'queue-a');
    });

    it('repassa erros da conexão da fila ao log como produtor', async () => {
        const { service, logs } = build([new FakeCommand('a-command', 'queue-a')]);
        await service.onApplicationBootstrap();
        const error = new Error('socket closed');

        created.queues[0]?.handlers.get('error')?.(error);

        expect(logs['connectionFailed']).toHaveBeenCalledWith('queue-a', 'producer', error);
    });

    it('fecha todas as filas abertas ao encerrar', async () => {
        const { service } = build([new FakeCommand('a-command', 'queue-a'), new FakeCommand('c-command', 'queue-b')]);
        await service.onApplicationBootstrap();

        await service.beforeApplicationShutdown();

        expect(created.queues.every((queue: QueueDouble) => queue.close.mock.calls.length === 1)).toBe(true);
    });

    it('encerra sem erro quando nenhuma fila foi aberta', async () => {
        const { service } = build([]);

        await expect(service.beforeApplicationShutdown()).resolves.toBeUndefined();
    });
});
