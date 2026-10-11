import { execSync } from 'node:child_process';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, StartedRedisContainer } from '@testcontainers/redis';
import { Client } from 'pg';
import type { TestProject } from 'vitest/node';

const TEMPLATE_DB: string = 'vera_template';

export async function setup(project: TestProject): Promise<() => Promise<void>> {
    const container: StartedPostgreSqlContainer = await new PostgreSqlContainer('postgres:16')
        .withTmpFs({ '/var/lib/postgresql/data': 'rw' })
        .start();

    const admin: Client = new Client({ connectionString: container.getConnectionUri() });
    await admin.connect();
    await admin.query(`CREATE DATABASE ${TEMPLATE_DB}`);
    await admin.end();

    const templateUri: string = uriForDatabase(container, TEMPLATE_DB);
    execSync('npx kysely migrate:latest', { env: { ...process.env, DATABASE_URL: templateUri }, stdio: 'pipe' });

    const redis: StartedRedisContainer = await new RedisContainer('redis:7-alpine').start();
    project.provide('redisNode', `${redis.getHost()}:${String(redis.getMappedPort(6379))}`);

    project.provide('pgAdminUri', container.getConnectionUri());
    project.provide('pgHostPort', `${container.getHost()}:${String(container.getMappedPort(5432))}`);
    project.provide('pgCredentials', `${container.getUsername()}:${container.getPassword()}`);

    return async (): Promise<void> => {
        await Promise.all([container.stop(), redis.stop()]);
    };
}

function uriForDatabase(container: StartedPostgreSqlContainer, database: string): string {
    return `postgresql://${container.getUsername()}:${container.getPassword()}@${container.getHost()}:${String(
        container.getMappedPort(5432)
    )}/${database}`;
}

declare module 'vitest' {
    export interface ProvidedContext {
        pgAdminUri: string;
        pgHostPort: string;
        pgCredentials: string;
        redisNode: string;
    }
}
