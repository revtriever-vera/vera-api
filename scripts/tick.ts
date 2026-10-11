import { loadEnvFile } from 'node:process';

try {
    loadEnvFile();
} catch {
    void 0;
}

import { Queue } from 'bullmq';
import { Cluster, ClusterNode, Redis } from 'ioredis';
import { v7 as uuidV7 } from 'uuid';
import { MESSAGE_TYPES, BULL_PREFIX, QUEUES } from '../src/shared/constants/queues.constants';

const DEFAULT_NODES: string = 'localhost:7200,localhost:7201,localhost:7202';
const QUEUE_NAMES: string[] = Object.values(QUEUES);
const MESSAGE_TYPE_VALUES: string[] = Object.values(MESSAGE_TYPES);

const TICK_TYPE_BY_QUEUE: Record<string, string> = {};

function connect(): Cluster | Redis {
    const nodes: ClusterNode[] = (process.env['REDIS_NODES'] ?? DEFAULT_NODES).split(',').map((entry: string) => {
        const [host, port] = entry.trim().split(':');
        return { host: host ?? 'localhost', port: Number(port ?? 7200) };
    });
    if (process.env['REDIS_CLUSTER'] === 'false') {
        const [node] = nodes as { host: string; port: number }[];
        return new Redis({ host: node?.host ?? 'localhost', port: node?.port ?? 6379, maxRetriesPerRequest: null });
    }
    return new Cluster(nodes, { redisOptions: { maxRetriesPerRequest: null } });
}

function tickTypeFor(queue: string, requested: string | undefined): string {
    if (requested) {
        const match: string | undefined = MESSAGE_TYPE_VALUES.find((value: string) => value.includes(requested));
        if (!match) {
            throw new Error(`tipo desconhecido: ${requested}`);
        }
        return match;
    }
    const type: string | undefined = TICK_TYPE_BY_QUEUE[queue];
    if (!type) {
        throw new Error(`nenhum tipo de tick mapeado para a fila ${queue}`);
    }
    return type;
}

async function tick(): Promise<void> {
    const name: string | undefined = process.argv[2];
    const queue: string | undefined = name ? QUEUE_NAMES.find((value: string) => value.includes(name)) : undefined;
    if (!name || !queue) {
        throw new Error(`uso: npm run tick -- <parte-do-nome-da-fila> [parte-do-tipo]. disponíveis: ${QUEUE_NAMES.join(', ')}`);
    }
    const type: string = tickTypeFor(queue, process.argv[3]);
    const connection: Cluster | Redis = connect();
    const client: Queue = new Queue(queue, { connection, prefix: BULL_PREFIX });
    await client.add(type, {
        type,
        requestId: uuidV7(),
        companyId: null,
        occurredAt: new Date().toISOString(),
        trace: {},
        payload: {}
    });
    await client.close();
    await connection.quit();
    console.log(`tick publicado em ${queue}`);
}

tick().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
