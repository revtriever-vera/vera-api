import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state: {
    args: unknown[][];
    instances: { set: ReturnType<typeof vi.fn>; eval: ReturnType<typeof vi.fn>; quit: ReturnType<typeof vi.fn> }[];
} = vi.hoisted(() => ({ args: [], instances: [] }));

vi.mock('ioredis', () => {
    class Redis {
        public readonly set: ReturnType<typeof vi.fn> = vi.fn(async (): Promise<string> => Promise.resolve('OK'));
        public readonly eval: ReturnType<typeof vi.fn> = vi.fn(async (): Promise<number> => Promise.resolve(1));
        public readonly quit: ReturnType<typeof vi.fn> = vi.fn(async (): Promise<void> => Promise.resolve());
        public readonly duplicate: () => Redis;

        public constructor(...args: unknown[]) {
            state.args.push(args);
            state.instances.push(this);
            this.duplicate = (): Redis => this;
        }
    }
    class Cluster extends Redis {}
    return { Redis, Cluster };
});

describe('RedisConnection', () => {
    beforeEach(() => {
        state.instances = [];
        state.args = [];
        vi.stubEnv('REDIS_CLUSTER', 'false');
        vi.stubEnv('REDIS_NODES', 'localhost:6379');
        vi.stubEnv('REDIS_DB', '0');
    });

    afterEach(() => {
        vi.unstubAllEnvs();
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

    it('falls back to port 7200 when a cluster node has no port', async () => {
        vi.stubEnv('REDIS_CLUSTER', 'true');
        vi.stubEnv('REDIS_NODES', 'localhost');
        const { RedisConnection } = await import('./redis.connection');

        new RedisConnection();

        expect(state.args[0]?.[0]).toEqual([{ host: 'localhost', port: 7200 }]);
    });
});
