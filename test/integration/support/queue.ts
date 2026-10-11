import Redis from 'ioredis';
import { PublishOptions, QueuePublisherPort } from '@src/core/queue/queue.types';
import { QueueName } from '@src/shared/constants/queues.constants';

export interface PublishedMessage {
    readonly queue: QueueName;
    readonly type: string;
    readonly payload: unknown;
    readonly options?: PublishOptions;
}

export class CapturingPublisher extends QueuePublisherPort {
    public readonly published: PublishedMessage[] = [];

    public async publish(queue: QueueName, type: string, payload: unknown, options?: PublishOptions): Promise<void> {
        this.published.push({ queue, type, payload, options });
        return Promise.resolve();
    }

    public ofType(type: string): PublishedMessage[] {
        return this.published.filter((message: PublishedMessage) => message.type === type);
    }
}

export function silentPublisher(): QueuePublisherPort {
    return new CapturingPublisher();
}

const REDIS_LOGICAL_DATABASES: number = 16;

export async function isolateRedisForWorker(node: string): Promise<void> {
    const database: number = Number(process.env['VITEST_POOL_ID'] ?? '0') % REDIS_LOGICAL_DATABASES;
    process.env['REDIS_CLUSTER'] = 'false';
    process.env['REDIS_NODES'] = node;
    process.env['REDIS_DB'] = String(database);

    const [host, port] = node.split(':');
    const client: Redis = new Redis({ host: host ?? 'localhost', port: Number(port ?? 6379), db: database, maxRetriesPerRequest: null });
    try {
        await client.flushdb();
    } finally {
        await client.quit();
    }
}
