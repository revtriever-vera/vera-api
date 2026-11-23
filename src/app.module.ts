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
import { LlmModule } from './core/llm/llm.module';
import { QueueModule } from './core/queue/queue.module';
import { UsageModule } from './core/usage/usage.module';
import { AiAssistantModule } from './modules/ai-assistant/ai-assistant.module';
import { AllocationModule } from './modules/allocation/allocation.module';
import { BankConnectionsModule } from './modules/bank-connections/bank-connections.module';
import { BillingModule } from './modules/billing/billing.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { ConcentrationModule } from './modules/concentration/concentration.module';
import { ContributionModule } from './modules/contribution/contribution.module';
import { FixedIncomeModule } from './modules/fixed-income/fixed-income.module';
import { FixedIncomeCoverageModule } from './modules/fixed-income-coverage/fixed-income-coverage.module';
import { FixedIncomeScheduleModule } from './modules/fixed-income-schedule/fixed-income-schedule.module';
import { HealthModule } from './modules/health/health.module';
import { IntegrationCredentialsModule } from './modules/integration-credentials/integration-credentials.module';
import { IdentityModule } from './modules/identity/identity.module';
import { PlatformAdminModule } from './modules/platform-admin/platform-admin.module';
import { IssuersModule } from './modules/issuers/issuers.module';
import { MarketDataModule } from './modules/market-data/market-data.module';
import { NoticesModule } from './modules/notices/notices.module';
import { OnboardingModule } from './modules/onboarding/onboarding.module';
import { PlansModule } from './modules/plans/plans.module';
import { PortfolioExportModule } from './modules/portfolio-export/portfolio-export.module';
import { PortfolioModule } from './modules/portfolio/portfolio.module';
import { PositionsModule } from './modules/positions/positions.module';
import { SpendingCategoriesModule } from './modules/spending-categories/spending-categories.module';
import { SpendingCutsModule } from './modules/spending-cuts/spending-cuts.module';
import { SpendingSummaryModule } from './modules/spending-summary/spending-summary.module';
import { StatementImportModule } from './modules/statement-import/statement-import.module';
import { TransactionsExportModule } from './modules/transactions-export/transactions-export.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { GoogleCalendarModule } from './modules/google-calendar/google-calendar.module';
import { RemindersModule } from './modules/reminders/reminders.module';
import { WhatsAppChatModule } from './modules/whatsapp-chat/whatsapp-chat.module';
import { WhatsAppLinkModule } from './modules/whatsapp-link/whatsapp-link.module';
import { WhatsAppModule } from './modules/whatsapp/whatsapp.module';

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
        UsageModule,
        LlmModule,
        HttpModule,
        HealthModule,
        IdentityModule,
        PlatformAdminModule,
        IntegrationCredentialsModule,
        AllocationModule,
        AiAssistantModule,
        OnboardingModule,
        CatalogModule,
        IssuersModule,
        FixedIncomeModule,
        FixedIncomeCoverageModule,
        FixedIncomeScheduleModule,
        PositionsModule,
        MarketDataModule,
        PortfolioModule,
        PortfolioExportModule,
        ConcentrationModule,
        ContributionModule,
        SpendingCategoriesModule,
        TransactionsModule,
        SpendingSummaryModule,
        SpendingCutsModule,
        TransactionsExportModule,
        StatementImportModule,
        BankConnectionsModule,
        PlansModule,
        BillingModule,
        WhatsAppModule,
        WhatsAppLinkModule,
        WhatsAppChatModule,
        GoogleCalendarModule,
        RemindersModule,
        NoticesModule
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
