import { DelayedError } from 'bullmq';
import { RedisConnection } from './redis.connection';
import { RunningJob } from './queue.types';

export interface JobMutexConfig {
    readonly lockKey: string;
    readonly identify: (envelope: unknown) => string;
    readonly ttlMinutes?: number;
    readonly delayMs?: number;
}

interface MutexHost {
    readonly redis?: RedisConnection;
}

const DEFAULT_TTL_MINUTES: number = 45;
const DEFAULT_DELAY_MS: number = 60_000;
const held: Map<string, { redis: RedisConnection; value: string }> = new Map();

export function JobMutex(config: JobMutexConfig) {
    return function (target: object, key: string, descriptor: PropertyDescriptor): PropertyDescriptor {
        const original: (...args: unknown[]) => Promise<unknown> = descriptor.value as (...args: unknown[]) => Promise<unknown>;

        descriptor.value = async function (this: MutexHost, envelope: unknown, job?: RunningJob, ...rest: unknown[]): Promise<unknown> {
            const redis: RedisConnection | undefined = this.redis;
            if (!redis) {
                throw new Error(`@JobMutex exige 'redis: RedisConnection' em ${target.constructor.name}`);
            }
            const { lockKey, lockValue, ttlMs } = lockContextOf(config, envelope, job);
            if (!(await redis.acquireLock(lockKey, ttlMs, lockValue))) {
                await job?.moveToDelayed(Date.now() + (config.delayMs ?? DEFAULT_DELAY_MS));
                throw new DelayedError(`outro worker já processa ${lockKey}`);
            }
            return runWithLock(original, this, redis, lockKey, lockValue, envelope, job, rest);
        };
        return descriptor;
    };
}

function lockContextOf(
    config: JobMutexConfig,
    envelope: unknown,
    job: RunningJob | undefined
): {
    lockKey: string;
    lockValue: string;
    ttlMs: number;
} {
    const lockKey: string = `${config.lockKey}:${config.identify(envelope)}`;
    const lockValue: string = `job:${job?.id ?? 'sem-job'}:${String(Date.now())}`;
    const ttlMs: number = (config.ttlMinutes ?? DEFAULT_TTL_MINUTES) * 60_000;
    return { lockKey, lockValue, ttlMs };
}

async function runWithLock(
    original: (...args: unknown[]) => Promise<unknown>,
    host: MutexHost,
    redis: RedisConnection,
    lockKey: string,
    lockValue: string,
    envelope: unknown,
    job: RunningJob | undefined,
    rest: unknown[]
): Promise<unknown> {
    held.set(lockKey, { redis, value: lockValue });
    try {
        return await original.apply(host, [envelope, job, ...rest]);
    } finally {
        held.delete(lockKey);
        await redis.releaseLock(lockKey, lockValue);
    }
}

export async function releaseAllHeldLocks(): Promise<number> {
    const locks: [string, { redis: RedisConnection; value: string }][] = [...held.entries()];
    held.clear();
    await Promise.allSettled(locks.map(async ([key, lock]) => lock.redis.releaseLock(key, lock.value)));
    return locks.length;
}
