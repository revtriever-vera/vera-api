import { DelayedError } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';
import { QueueEnvelope, RunningJob } from '../../../../core/queue/queue.types';
import { RedisConnection } from '../../../../core/queue/redis.connection';
import { configOf } from '../../../../../test/support/bank-connections-fakes';
import { ConnectionSyncApplication, SyncDirective } from '../../application/connection-sync.application';
import { ConnectionSyncHandler } from './connection-sync.handler';

const ENVELOPE: QueueEnvelope = {
    type: 'bank-connections.sync.requested',
    requestId: 'request-1',
    companyId: null,
    occurredAt: new Date().toISOString(),
    trace: {},
    payload: { connectionId: 'c1', companyId: 'co1', trigger: 'daily' }
};

function build(
    directive: SyncDirective,
    acquired: boolean = true
): {
    handler: ConnectionSyncHandler;
    handle: ReturnType<typeof vi.fn>;
    acquireLock: ReturnType<typeof vi.fn>;
} {
    const handle: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(directive);
    const acquireLock: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(acquired);
    const redis: RedisConnection = { acquireLock, releaseLock: vi.fn().mockResolvedValue(true) } as unknown as RedisConnection;
    const handler: ConnectionSyncHandler = new ConnectionSyncHandler(
        { handle } as unknown as ConnectionSyncApplication,
        redis,
        configOf({ PLUGGY_SYNC_JOBS_PER_MINUTE: 12 })
    );
    return { handler, handle, acquireLock };
}

function job(attemptsStarted: number, maxAttempts: number = 3): { job: RunningJob; moveToDelayed: ReturnType<typeof vi.fn> } {
    const moveToDelayed: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(undefined);
    return { job: { id: 'job-1', attemptsStarted, maxAttempts, moveToDelayed }, moveToDelayed };
}

describe('ConnectionSyncHandler', () => {
    it('declara a fila, o tipo, a concorrência 2 e o limitador global por minuto', () => {
        const { handler } = build({ retryAfterSeconds: null, failure: null });

        expect(handler.queue).toBe('vera-bank-connections');
        expect(handler.type).toBe('bank-connections.sync.requested');
        expect(handler.workerOptions).toEqual({ concurrency: 2, limiter: { max: 12, duration: 60_000 } });
    });

    it('entrega o payload à application e termina quando não há o que repetir', async () => {
        const { handler, handle } = build({ retryAfterSeconds: null, failure: null });

        await expect(handler.handle(ENVELOPE, job(1).job)).resolves.toBeUndefined();

        expect(handle).toHaveBeenCalledWith(ENVELOPE.payload);
    });

    it('trava por conexão com o mutex e cede o job quando outra execução roda', async () => {
        const free = build({ retryAfterSeconds: null, failure: null });
        const busy = build({ retryAfterSeconds: null, failure: null }, false);
        const { job: running, moveToDelayed } = job(1);

        await free.handler.handle(ENVELOPE, running);
        await expect(busy.handler.handle(ENVELOPE, running)).rejects.toBeInstanceOf(DelayedError);

        expect(free.acquireLock.mock.calls[0]?.[0]).toBe('pluggy-sync:c1');
        expect(busy.handle).not.toHaveBeenCalled();
        expect(moveToDelayed).toHaveBeenCalledOnce();
    });

    it('usa uma chave neutra quando o payload não traz a conexão', async () => {
        const { handler, acquireLock } = build({ retryAfterSeconds: null, failure: null });

        await handler.handle({ ...ENVELOPE, payload: {} }, job(1).job);

        expect(acquireLock.mock.calls[0]?.[0]).toBe('pluggy-sync:unknown');
    });

    it('reagenda com o atraso da Pluggy quando ainda há tentativas', async () => {
        const { handler } = build({ retryAfterSeconds: 90, failure: new Error('rate') });
        const { job: running, moveToDelayed } = job(1);
        const before: number = Date.now();

        await expect(handler.handle(ENVELOPE, running)).rejects.toBeInstanceOf(DelayedError);

        const target: number = moveToDelayed.mock.calls[0]?.[0] as number;
        expect(target).toBeGreaterThanOrEqual(before + 90_000);
        expect(target).toBeLessThan(before + 95_000);
    });

    it('sem tentativas sobrando devolve a falha para a fila registrar', async () => {
        const failure: Error = new Error('rate');
        const { handler } = build({ retryAfterSeconds: 90, failure });
        const { job: running, moveToDelayed } = job(3);

        await expect(handler.handle(ENVELOPE, running)).rejects.toBe(failure);

        expect(moveToDelayed).not.toHaveBeenCalled();
    });

    it('devolve a falha sem atraso para o backoff da fila e embrulha o que não é erro', async () => {
        const failure: Error = new Error('down');

        await expect(build({ retryAfterSeconds: null, failure }).handler.handle(ENVELOPE, job(1).job)).rejects.toBe(failure);
        await expect(build({ retryAfterSeconds: null, failure: 'texto' }).handler.handle(ENVELOPE, job(1).job)).rejects.toThrow(
            'pluggy_sync_failed'
        );
        await expect(build({ retryAfterSeconds: 10, failure: new Error('x') }).handler.handle(ENVELOPE)).rejects.toThrow('x');
    });
});
