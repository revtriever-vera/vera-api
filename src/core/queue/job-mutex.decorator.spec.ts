import { DelayedError } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';
import { JobMutex, releaseAllHeldLocks } from './job-mutex.decorator';
import { RedisConnection } from './redis.connection';
import { RunningJob } from './queue.types';

function fakeRedis(acquireResult: boolean = true): {
    redis: RedisConnection;
    acquireLock: ReturnType<typeof vi.fn>;
    releaseLock: ReturnType<typeof vi.fn>;
} {
    const acquireLock: ReturnType<typeof vi.fn> = vi.fn(async (): Promise<boolean> => Promise.resolve(acquireResult));
    const releaseLock: ReturnType<typeof vi.fn> = vi.fn(async (): Promise<boolean> => Promise.resolve(true));
    return { redis: { acquireLock, releaseLock } as unknown as RedisConnection, acquireLock, releaseLock };
}

function jobWith(): { job: RunningJob; moveToDelayed: ReturnType<typeof vi.fn> } {
    const moveToDelayed: ReturnType<typeof vi.fn> = vi.fn(async (): Promise<void> => Promise.resolve());
    return { job: { id: 'job-1', attemptsStarted: 1, maxAttempts: 5, moveToDelayed }, moveToDelayed };
}

describe('JobMutex', () => {
    it('acquires the lock, runs the handler and releases the lock afterwards', async () => {
        const { redis, acquireLock, releaseLock } = fakeRedis(true);
        class Handler {
            public readonly redis: RedisConnection = redis;

            @JobMutex({ lockKey: 'sample', identify: (): string => 'company-1' })
            public async handle(): Promise<string> {
                return Promise.resolve('done');
            }
        }

        await expect(new Handler().handle()).resolves.toBe('done');
        expect(acquireLock).toHaveBeenCalledOnce();
        expect(releaseLock).toHaveBeenCalledOnce();
    });

    it('yields with DelayedError and moves the job when the lock is already held', async () => {
        const { redis } = fakeRedis(false);
        const { job, moveToDelayed } = jobWith();
        class Handler {
            public readonly redis: RedisConnection = redis;

            @JobMutex({ lockKey: 'sample', identify: (): string => 'company-1' })
            public async handle(_envelope: unknown, _job?: RunningJob): Promise<string> {
                return Promise.resolve('should-not-run');
            }
        }

        await expect(new Handler().handle({}, job)).rejects.toBeInstanceOf(DelayedError);
        expect(moveToDelayed).toHaveBeenCalledOnce();
    });

    it('releases the lock even when the handler throws', async () => {
        const { redis, releaseLock } = fakeRedis(true);
        class Handler {
            public readonly redis: RedisConnection = redis;

            @JobMutex({ lockKey: 'sample', identify: (): string => 'company-1' })
            public handle(): Promise<void> {
                throw new Error('boom');
            }
        }

        await expect(new Handler().handle()).rejects.toThrow('boom');
        expect(releaseLock).toHaveBeenCalledOnce();
    });

    it('throws a clear setup error when the host has no redis connection', async () => {
        class Handler {
            @JobMutex({ lockKey: 'sample', identify: (): string => 'company-1' })
            public async handle(): Promise<void> {
                return Promise.resolve();
            }
        }

        await expect(new Handler().handle()).rejects.toThrow(/redis/);
    });

    it('releaseAllHeldLocks releases every currently held lock and reports how many', async () => {
        const { redis } = fakeRedis(true);
        class Handler {
            public readonly redis: RedisConnection = redis;

            @JobMutex({ lockKey: 'held', identify: (): string => 'company-1', delayMs: 1 })
            public async handle(): Promise<void> {
                await releaseAllHeldLocks();
            }
        }

        await new Handler().handle();
        expect(await releaseAllHeldLocks()).toBe(0);
    });
});
