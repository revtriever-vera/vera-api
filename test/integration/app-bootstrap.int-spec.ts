import { afterAll, beforeAll, describe, expect, it, inject } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import { isolateRedisForWorker } from './support/queue';
import { createIsolatedDatabase, IsolatedDatabase } from './support/isolated-database';

describe('application bootstrap', () => {
    let app: INestApplication | null = null;
    let database: IsolatedDatabase;

    beforeAll(async () => {
        database = await createIsolatedDatabase('bootstrap');
        process.env['DATABASE_URL'] = database.url;
        await isolateRedisForWorker(inject('redisNode'));
        process.env['NODE_ENV'] = 'test';
        process.env['IS_LOCAL'] = 'true';
        process.env['DEPLOY_ENV'] = 'local';
    });

    afterAll(async () => {
        await app?.close();
        await database.drop();
    });

    it('resolves every dependency in the module graph, which no other test does', async () => {
        const testing: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
        app = testing.createNestApplication();

        await expect(app.init()).resolves.toBeDefined();
    });
});
