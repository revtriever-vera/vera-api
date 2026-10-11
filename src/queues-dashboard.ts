import { INestApplication } from '@nestjs/common';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { Queue } from 'bullmq';
import basicAuth from 'express-basic-auth';
import { AppConfig } from './config/app.config';
import { RedisConnection } from './core/queue/redis.connection';
import { QUEUES, QueueName } from './shared/constants/queues.constants';
import { bullPrefixFromEnvironment } from './shared/config/bull-prefix';

const DASHBOARD_PATH: string = '/admin/queues';

export function setupQueuesDashboard(app: INestApplication, config: AppConfig): void {
    const redis: RedisConnection = app.get(RedisConnection);
    const adapter: ExpressAdapter = new ExpressAdapter();
    adapter.setBasePath(DASHBOARD_PATH);

    createBullBoard({
        queues: Object.values<QueueName>(QUEUES).map(
            (name: QueueName) => new BullMQAdapter(new Queue(name, { connection: redis.connection, prefix: bullPrefixFromEnvironment() }))
        ),
        serverAdapter: adapter
    });

    app.use(
        DASHBOARD_PATH,
        basicAuth({ users: { [config.QUEUES_DASHBOARD_USER]: config.QUEUES_DASHBOARD_PASSWORD }, challenge: true }),
        adapter.getRouter()
    );
}
