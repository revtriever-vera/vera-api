import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigType } from '@nestjs/config';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { ZodValidationPipe } from 'nestjs-zod';
import { LoggerModule } from 'nestjs-pino';
import { appConfig } from './config/app.config';
import { requestLogLevel, requestLogProps } from './core/observability/http-log';
import { redactRequest, SerializedRequest } from './core/observability/url-redaction';
import { ContextModule } from './core/context/context.module';
import { CryptoModule } from './core/crypto/crypto.module';
import { RequestContextMiddleware } from './core/context/request-context.middleware';
import { HttpModule } from './core/http/http.module';
import { AppErrorFilter } from './core/http/app-error.filter';
import { ObservabilityModule } from './core/observability/observability.module';
import { QueueModule } from './core/queue/queue.module';
import { AllocationModule } from './modules/allocation/allocation.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { ContributionModule } from './modules/contribution/contribution.module';
import { FixedIncomeModule } from './modules/fixed-income/fixed-income.module';
import { HealthModule } from './modules/health/health.module';
import { IdentityModule } from './modules/identity/identity.module';
import { MarketDataModule } from './modules/market-data/market-data.module';
import { OnboardingModule } from './modules/onboarding/onboarding.module';
import { PortfolioExportModule } from './modules/portfolio-export/portfolio-export.module';
import { PortfolioModule } from './modules/portfolio/portfolio.module';
import { PositionsModule } from './modules/positions/positions.module';
import { SpendingCategoriesModule } from './modules/spending-categories/spending-categories.module';
import { SpendingSummaryModule } from './modules/spending-summary/spending-summary.module';
import { TransactionsExportModule } from './modules/transactions-export/transactions-export.module';
import { TransactionsModule } from './modules/transactions/transactions.module';

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
        CryptoModule,
        ObservabilityModule,
        QueueModule,
        HttpModule,
        HealthModule,
        IdentityModule,
        AllocationModule,
        OnboardingModule,
        CatalogModule,
        FixedIncomeModule,
        PositionsModule,
        MarketDataModule,
        PortfolioModule,
        PortfolioExportModule,
        ContributionModule,
        SpendingCategoriesModule,
        TransactionsModule,
        SpendingSummaryModule,
        TransactionsExportModule
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
