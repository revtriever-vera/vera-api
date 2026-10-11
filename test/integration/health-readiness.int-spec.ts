import { AddressInfo, Server } from 'node:net';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it, inject } from 'vitest';
import { AppModule } from '../../src/app.module';
import { DatabaseClient } from '../../src/core/database/database.client';
import { isolateRedisForWorker } from './support/queue';
import { createIsolatedDatabase, IsolatedDatabase } from './support/isolated-database';

describe('health endpoints', () => {
    let app: INestApplication;
    let origin: string;
    let isolated: IsolatedDatabase;

    beforeAll(async () => {
        isolated = await createIsolatedDatabase('health');
        process.env['DATABASE_URL'] = isolated.url;
        await isolateRedisForWorker(inject('redisNode'));
        process.env['NODE_ENV'] = 'test';
        process.env['IS_LOCAL'] = 'true';
        process.env['DEPLOY_ENV'] = 'local';

        const testing: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
        app = testing.createNestApplication();
        await app.init();
        await app.listen(0);
        const server: Server = app.getHttpServer() as Server;
        const address: AddressInfo = server.address() as AddressInfo;
        origin = `http://127.0.0.1:${String(address.port)}`;
    });

    afterAll(async () => {
        await app.close();
        await isolated.drop();
    });

    it('answers liveness with 200 regardless of the database', async () => {
        const response: Response = await fetch(`${origin}/health`);

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ status: 'ok' });
    });

    it('answers readiness with 200 while the database responds', async () => {
        const response: Response = await fetch(`${origin}/health/ready`);

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ status: 'ok', checks: { database: true } });
    });

    it('answers readiness with 503 once the database pool is gone, so a load balancer can act on it', async () => {
        const client: DatabaseClient = app.get(DatabaseClient);
        await client.destroy();

        const response: Response = await fetch(`${origin}/health/ready`);

        expect(response.status).toBe(503);
        expect(await response.json()).toEqual({ status: 'degraded', checks: { database: false } });
    });

    it('keeps liveness at 200 with the database down, so a slow database never gets the task killed', async () => {
        const response: Response = await fetch(`${origin}/health`);

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ status: 'ok' });
    });
});
