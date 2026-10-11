import { describe, expect, it } from 'vitest';
import { DURATION_BUCKETS_MS, durationViews, resourceAttributes } from './tracing';

const ENVIRONMENT: string = 'deployment.environment.name';
const VERSION: string = 'service.version';

describe('telemetry resource attributes', () => {
    it('names the environment from DEPLOY_ENV, because the dev account also runs as NODE_ENV=production', () => {
        const attributes: Record<string, string> = resourceAttributes({ DEPLOY_ENV: 'dev', NODE_ENV: 'production' });

        expect(attributes[ENVIRONMENT]).toBe('dev');
    });

    it('falls back to NODE_ENV where nobody deploys, which is the developer machine', () => {
        const attributes: Record<string, string> = resourceAttributes({ NODE_ENV: 'development' });

        expect(attributes[ENVIRONMENT]).toBe('development');
    });

    it('takes the version from APP_VERSION, since npm_package_version is absent under node dist/main.js', () => {
        const attributes: Record<string, string> = resourceAttributes({ APP_VERSION: 'sha-abc123' });

        expect(attributes[VERSION]).toBe('sha-abc123');
    });

    it('takes the service name from OTEL_SERVICE_NAME, so a companion process ships as its own service', () => {
        const attributes: Record<string, string> = resourceAttributes({ OTEL_SERVICE_NAME: 'vera-worker' });

        expect(attributes['service.name']).toBe('vera-worker');
    });

    it('ships as vera-api when no service name is declared', () => {
        const attributes: Record<string, string> = resourceAttributes({});

        expect(attributes['service.name']).toBe('vera-api');
    });

    it('tags every signal with the vera namespace, which separates this project from its neighbours on the shared Grafana', () => {
        const attributes: Record<string, string> = resourceAttributes({ OTEL_SERVICE_NAME: 'vera-worker' });

        expect(attributes['service.namespace']).toBe('vera');
    });

    it('reports 0.0.0 only when nothing said otherwise', () => {
        const attributes: Record<string, string> = resourceAttributes({});

        expect(attributes[VERSION]).toBe('0.0.0');
        expect(attributes[ENVIRONMENT]).toBe('development');
    });
});

describe('histogram buckets', () => {
    it('every *_duration_ms histogram gets buckets that reach a slow turn, not the 10s default ceiling', () => {
        const [view] = durationViews();

        expect(view?.instrumentName).toBe('*_duration_ms');
        expect(view?.aggregation).toMatchObject({ options: { boundaries: [...DURATION_BUCKETS_MS] } });
        expect(DURATION_BUCKETS_MS[DURATION_BUCKETS_MS.length - 1]).toBeGreaterThanOrEqual(60_000);
    });
});
