import { INestApplication } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AppConfig } from './config/app.config';
import { RedisConnection } from './core/queue/redis.connection';

function fakeApp(redis: RedisConnection): { app: INestApplication; use: ReturnType<typeof vi.fn> } {
    const use: ReturnType<typeof vi.fn> = vi.fn();
    return { app: { use, get: (): RedisConnection => redis } as unknown as INestApplication, use };
}

function configOf(): AppConfig {
    return { QUEUES_DASHBOARD_USER: 'admin', QUEUES_DASHBOARD_PASSWORD: 'secret' } as AppConfig;
}

describe('setupQueuesDashboard', () => {
    it('mounts the dashboard behind basic auth, using the app RedisConnection', async () => {
        const { setupQueuesDashboard } = await import('./queues-dashboard');
        const redis: RedisConnection = { connection: {} } as unknown as RedisConnection;
        const { app, use } = fakeApp(redis);

        setupQueuesDashboard(app, configOf());

        expect(use).toHaveBeenCalledWith('/admin/queues', expect.any(Function), expect.anything());
    });
});
