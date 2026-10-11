import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { Cluster, ClusterNode, ClusterOptions, Redis } from 'ioredis';

const DEFAULT_NODES: string = 'localhost:7200,localhost:7201,localhost:7202';
const SLOTS_REFRESH_INTERVAL_MS: number = 60_000;
const SLOTS_REFRESH_TIMEOUT_MS: number = 10_000;
const CONNECT_TIMEOUT_MS: number = 10_000;
const KEEP_ALIVE_MS: number = 30_000;
const MAX_RETRY_DELAY_MS: number = 2000;

function nodesFromEnv(): ClusterNode[] {
    return (process.env['REDIS_NODES'] ?? DEFAULT_NODES).split(',').map((entry: string) => {
        const [host, port] = entry.trim().split(':');
        return { host: host ?? 'localhost', port: Number(port ?? 7000) };
    });
}

function optionsFromEnv(): ClusterOptions {
    const useTls: boolean = process.env['REDIS_TLS'] === 'true';
    return {
        clusterRetryStrategy: (times: number) => Math.min(times * 100, MAX_RETRY_DELAY_MS),
        slotsRefreshInterval: SLOTS_REFRESH_INTERVAL_MS,
        slotsRefreshTimeout: SLOTS_REFRESH_TIMEOUT_MS,
        enableOfflineQueue: true,
        enableReadyCheck: false,
        redisOptions: {
            reconnectOnError: (error: Error) => error.message.includes('ClusterAllFailedError'),
            connectTimeout: CONNECT_TIMEOUT_MS,
            enableReadyCheck: false,
            enableAutoPipelining: true,
            noDelay: true,
            keepAlive: KEEP_ALIVE_MS,
            maxRetriesPerRequest: null,
            tls: useTls ? { rejectUnauthorized: false } : undefined
        }
    };
}

function buildClient(): Cluster | Redis {
    const nodes: ClusterNode[] = nodesFromEnv();
    if (process.env['REDIS_CLUSTER'] === 'false') {
        const [node] = nodes as { host: string; port: number }[];
        return new Redis({
            host: node?.host ?? 'localhost',
            port: node?.port ?? 6379,
            db: Number(process.env['REDIS_DB'] ?? 0),
            maxRetriesPerRequest: null
        });
    }
    return new Cluster(nodes, optionsFromEnv());
}

@Injectable()
export class RedisConnection implements OnApplicationShutdown {
    private readonly client: Cluster | Redis = buildClient();

    public get connection(): Cluster | Redis {
        return this.client;
    }

    public duplicate(): Cluster | Redis {
        const duplicable: { duplicate(): Cluster | Redis } = this.client;
        return duplicable.duplicate();
    }

    public async acquireLock(key: string, ttlMs: number, value: string): Promise<boolean> {
        const result: string | null = await this.client.set(key, value, 'PX', ttlMs, 'NX');
        return result === 'OK';
    }

    public async releaseLock(key: string, value: string): Promise<boolean> {
        const script: string = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";
        const released: unknown = await this.client.eval(script, 1, key, value);
        return released === 1;
    }

    public async onApplicationShutdown(): Promise<void> {
        await this.client.quit();
    }
}
