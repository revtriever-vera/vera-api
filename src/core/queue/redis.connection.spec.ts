import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state: { instances: { set: ReturnType<typeof vi.fn>; eval: ReturnType<typeof vi.fn>; quit: ReturnType<typeof vi.fn> }[] } =
    vi.hoisted(() => ({ instances: [] }));

vi.mock('ioredis', () => {
    class Redis {
        public readonly set: ReturnType<typeof vi.fn> = vi.fn(async (): Promise<string> => Promise.resolve('OK'));
        public readonly eval: ReturnType<typeof vi.fn> = vi.fn(async (): Promise<number> => Promise.resolve(1));
        public readonly quit: ReturnType<typeof vi.fn> = vi.fn(async (): Promise<void> => Promise.resolve());
        public readonly duplicate: () => Redis;

        public constructor() {
            state.instances.push(this);
            this.duplicate = (): Redis => this;
        }
    }
    class Cluster extends Redis {}
    return { Redis, Cluster };
});

const ORIGINAL_ENV: NodeJS.ProcessEnv = { ...process.env };

describe('RedisConnection', () => {
    beforeEach(() => {
        state.instances = [];
        process.env = { ...ORIGINAL_ENV, REDIS_CLUSTER: 'false', REDIS_NODES: 'localhost:6379', REDIS_DB: '0' };
    });

    afterEach(() => {
        process.env = { ...ORIGINAL_ENV };
    });

    it('acquires and releases a lock through the underlying client', async () => {
        const { RedisConnection } = await import('./redis.connection');
        const connection = new RedisConnection();

        expect(await connection.acquireLock('key', 1000, 'value')).toBe(true);
        expect(await connection.releaseLock('key', 'value')).toBe(true);
    });

    it('exposes the raw connection and its duplicate', async () => {
        const { RedisConnection } = await import('./redis.connection');
        const connection = new RedisConnection();

        expect(connection.connection).toBeDefined();
        expect(connection.duplicate()).toBeDefined();
    });

    it('closes the connection on application shutdown', async () => {
        const { RedisConnection } = await import('./redis.connection');
        const connection = new RedisConnection();

        await connection.onApplicationShutdown();

        expect(state.instances[0]?.quit).toHaveBeenCalledOnce();
    });
});
