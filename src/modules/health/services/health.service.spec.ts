import { describe, expect, it } from 'vitest';
import { DatabaseClient } from '../../../core/database/database.client';
import { HealthService, Readiness } from './health.service';

function databaseStub(healthy: boolean): DatabaseClient {
    return { isHealthy: async (): Promise<boolean> => Promise.resolve(healthy) } as unknown as DatabaseClient;
}

describe('HealthService', () => {
    it('reports ok with database true while the database responds', async () => {
        const health: HealthService = new HealthService(databaseStub(true));

        const readiness: Readiness = await health.readiness();

        expect(readiness).toEqual({ status: 'ok', checks: { database: true } });
    });

    it('reports degraded with database false once the database stops responding', async () => {
        const health: HealthService = new HealthService(databaseStub(false));

        const readiness: Readiness = await health.readiness();

        expect(readiness).toEqual({ status: 'degraded', checks: { database: false } });
    });
});
