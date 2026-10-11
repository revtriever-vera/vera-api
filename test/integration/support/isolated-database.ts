import { inject } from 'vitest';
import { Client } from 'pg';

const TEMPLATE_DB: string = 'vera_template';

export interface IsolatedDatabase {
    readonly url: string;
    readonly drop: () => Promise<void>;
}

export async function createIsolatedDatabase(label: string): Promise<IsolatedDatabase> {
    const name: string = `test_${label}_w${process.env['VITEST_POOL_ID'] ?? '0'}`;
    await onAdmin(async (admin: Client): Promise<void> => {
        await admin.query(`DROP DATABASE IF EXISTS ${name}`);
        await admin.query(`CREATE DATABASE ${name} TEMPLATE ${TEMPLATE_DB}`);
    });
    return {
        url: `postgresql://${inject('pgCredentials')}@${inject('pgHostPort')}/${name}`,
        drop: async (): Promise<void> => {
            await onAdmin(async (admin: Client): Promise<void> => {
                await admin.query(`DROP DATABASE IF EXISTS ${name}`);
            });
        }
    };
}

async function onAdmin(fn: (admin: Client) => Promise<void>): Promise<void> {
    const admin: Client = new Client({ connectionString: inject('pgAdminUri') });
    await admin.connect();
    try {
        await fn(admin);
    } finally {
        await admin.end();
    }
}
