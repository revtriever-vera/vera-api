import { HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { describe, expect, it } from 'vitest';
import { HealthController } from './health.controller';
import { HealthService, Readiness } from './services/health.service';
import { healthSchema, readinessSchema } from './validation/health.schema';

function responseSpy(): { response: Response; statuses: number[] } {
    const statuses: number[] = [];
    const response: Response = {
        status: (code: number): void => {
            statuses.push(code);
        }
    } as unknown as Response;
    return { response, statuses };
}

function controllerWith(readiness: Readiness): HealthController {
    const service: HealthService = { readiness: async (): Promise<Readiness> => Promise.resolve(readiness) } as unknown as HealthService;
    return new HealthController(service);
}

describe('HealthController', () => {
    it('answers liveness with a static ok body matching the schema', () => {
        const body: unknown = controllerWith({ status: 'ok', checks: { database: true } }).check();

        expect(healthSchema.parse(body)).toEqual({ status: 'ok' });
    });

    it('answers readiness with 200 while every check passes', async () => {
        const { response, statuses } = responseSpy();

        const body: Readiness = await controllerWith({ status: 'ok', checks: { database: true } }).ready(response);

        expect(statuses).toEqual([HttpStatus.OK]);
        expect(readinessSchema.parse(body)).toEqual({ status: 'ok', checks: { database: true } });
    });

    it('answers readiness with 503 when the database is down', async () => {
        const { response, statuses } = responseSpy();

        const body: Readiness = await controllerWith({ status: 'degraded', checks: { database: false } }).ready(response);

        expect(statuses).toEqual([HttpStatus.SERVICE_UNAVAILABLE]);
        expect(body.status).toBe('degraded');
    });
});
