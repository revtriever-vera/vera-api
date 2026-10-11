import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigType } from '@nestjs/config';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { ZodValidationPipe } from 'nestjs-zod';
import { LoggerModule } from 'nestjs-pino';
import { appConfig } from './config/app.config';
import { requestLogLevel, requestLogProps } from './core/observability/http-log';
import { redactRequest, SerializedRequest } from './core/observability/url-redaction';
import { ContextModule } from './core/context/context.module';
import { RequestContextMiddleware } from './core/context/request-context.middleware';
import { HttpModule } from './core/http/http.module';
import { AppErrorFilter } from './core/http/app-error.filter';
import { ObservabilityModule } from './core/observability/observability.module';
import { QueueModule } from './core/queue/queue.module';
import { AllocationModule } from './modules/allocation/allocation.module';
import { HealthModule } from './modules/health/health.module';
import { IdentityModule } from './modules/identity/identity.module';
import { OnboardingModule } from './modules/onboarding/onboarding.module';

const REDACTED_PATHS: string[] = ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'];

@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [appConfig] }),
        LoggerModule.forRootAsync({
            inject: [appConfig.KEY],
            useFactory: (app: ConfigType<typeof appConfig>) => ({
                pinoHttp: {
                    level: app.LOG_LEVEL,
                    redact: { paths: REDACTED_PATHS, remove: true },
                    customLogLevel: requestLogLevel,
                    customProps: requestLogProps,
                    serializers: {
                        req: (request: SerializedRequest): SerializedRequest => redactRequest(request)
                    },
                    transport: app.NODE_ENV === 'development' ? { target: 'pino-pretty', options: { singleLine: true } } : undefined
                }
            })
        }),
        ContextModule,
        ObservabilityModule,
        QueueModule,
        HttpModule,
        HealthModule,
        IdentityModule,
        AllocationModule,
        OnboardingModule
    ],
    providers: [
        { provide: APP_PIPE, useClass: ZodValidationPipe },
        { provide: APP_FILTER, useClass: AppErrorFilter }
    ]
})
export class AppModule implements NestModule {
    public configure(consumer: MiddlewareConsumer): void {
        consumer.apply(RequestContextMiddleware).forRoutes('*');
    }
}
