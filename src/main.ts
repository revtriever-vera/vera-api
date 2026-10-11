import { startTracing } from './tracing';

startTracing();

import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import type { Express } from 'express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { AppConfig, appConfig } from './config/app.config';
import { isAllowedOrigin } from './core/http/cors-origin';
import { setupQueuesDashboard } from './queues-dashboard';
import { setupSwagger } from './swagger';

async function bootstrap(): Promise<void> {
    const app: INestApplication = await NestFactory.create(AppModule, { bufferLogs: true, rawBody: true });
    applyMiddleware(app);
    const config: AppConfig = app.get<AppConfig>(appConfig.KEY);
    app.enableCors({
        origin: (origin: string | undefined, decide: (error: Error | null, allowed?: boolean) => void): void => {
            decide(null, isAllowedOrigin(origin, config.IS_LOCAL, config.CORS_ORIGINS));
        },
        credentials: true
    });
    applyOptionalFeatures(app, config);
    await app.listen(config.PORT);
}

function applyMiddleware(app: INestApplication): void {
    app.useLogger(app.get(Logger));
    app.use(helmet());
    (app.getHttpAdapter().getInstance() as Express).disable('x-powered-by');
    app.use(cookieParser());
    app.enableShutdownHooks();
}

function applyOptionalFeatures(app: INestApplication, config: AppConfig): void {
    if (config.DOCS_ENABLED) {
        setupSwagger(app, config);
    }
    if (config.QUEUES_DASHBOARD_ENABLED) {
        setupQueuesDashboard(app, config);
    }
}

void bootstrap();
