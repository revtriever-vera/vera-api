import { inject } from 'vitest';
import { Client } from 'pg';
import { AlsAppContext } from '@src/core/context/als-app-context';
import { ContextHolder } from '@src/core/context/as-company.decorator';
import { KyselyDatabaseClient } from '@src/core/database/kysely-database.client';
import { TransactionalContext } from '@src/core/database/using-transaction.decorator';
import type { LogService } from '@src/core/observability/log.service';

function silentLogService(): LogService {
    return { info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined } as unknown as LogService;
}

const TEMPLATE_DB: string = 'vera_template';

export interface TestDatabase {
    readonly client: KyselyDatabaseClient;
    readonly context: AlsAppContext;
    readonly destroy: () => Promise<void>;
}

class RollbackSignal extends Error {}

let created: boolean = false;

async function ensureTemplateDatabase(workerDb: string): Promise<void> {
    const admin: Client = new Client({ connectionString: inject('pgAdminUri') });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${workerDb}`);
    await admin.query(`CREATE DATABASE ${workerDb} TEMPLATE ${TEMPLATE_DB}`);
    await admin.end();
}

function buildClient(workerDb: string): KyselyDatabaseClient {
    const client: KyselyDatabaseClient = new KyselyDatabaseClient(
        {
            DATABASE_URL: `postgresql://${inject('pgCredentials')}@${inject('pgHostPort')}/${workerDb}`,
            DATABASE_POOL_MAX: 5
        },
        silentLogService()
    );
    TransactionalContext.set(client);
    return client;
}

export async function createTestDatabase(): Promise<TestDatabase> {
    const workerDb: string = `test_w${process.env['VITEST_POOL_ID'] ?? '0'}`;
    if (!created) {
        await ensureTemplateDatabase(workerDb);
        created = true;
    }
    const client: KyselyDatabaseClient = buildClient(workerDb);
    const context: AlsAppContext = new AlsAppContext();
    ContextHolder.set(context);
    return {
        client,
        context,
        destroy: async (): Promise<void> => client.destroy()
    };
}

export async function inRollback(client: KyselyDatabaseClient, fn: () => Promise<void>): Promise<void> {
    try {
        await client.withTransaction(async () => {
            await fn();
            throw new RollbackSignal();
        });
    } catch (error) {
        if (!(error instanceof RollbackSignal)) {
            throw error;
        }
    }
}
