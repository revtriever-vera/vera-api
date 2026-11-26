import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ContextModule } from '../../../core/context/context.module';
import { ObservabilityModule } from '../../../core/observability/observability.module';
import { QueueModule } from '../../../core/queue/queue.module';
import { portfolioWatchConfig } from '../config/portfolio-watch.config';
import { FixedIncomeServicesModule } from '../../fixed-income/services/fixed-income-services.module';
import { CatalogApplicationModule } from '../../catalog/application/catalog-application.module';
import { FixedIncomeScheduleApplicationModule } from '../../fixed-income-schedule/application/fixed-income-schedule-application.module';
import { NoticesApplicationModule } from '../../notices/application/notices-application.module';
import { MarketDocumentsApplicationModule } from '../../market-documents/application/market-documents-application.module';
import { PlansApplicationModule } from '../../plans/application/plans-application.module';
import { PortfolioApplicationModule } from '../../portfolio/application/portfolio-application.module';
import { PortfolioEventsApplicationModule } from '../../portfolio-events/application/portfolio-events-application.module';
import { PositionsApplicationModule } from '../../positions/application/positions-application.module';
import { PortfolioWatchDomainModule } from '../domain/portfolio-watch-domain.module';
import { MailModule } from '../../../core/mail/mail.module';
import { PortfolioAgendaService } from '../services/portfolio-agenda.service';
import { PortfolioIncomeLedgerService } from '../services/portfolio-income-ledger.service';
import { PortfolioWatchAccountEraser } from '../services/portfolio-watch-account.eraser';
import { PortfolioWatchAccountExporter } from '../services/portfolio-watch-account.exporter';
import { PortfolioWeeklyChangesTemplates } from '../services/portfolio-weekly-changes.templates';
import { PortfolioWatchDigestTemplates } from '../services/portfolio-watch-digest.templates';
import { PortfolioWatchLogService } from '../services/portfolio-watch-log.service';
import { PortfolioWatchNoticeRegistrar } from '../services/portfolio-watch-notice.registrar';
import { PortfolioWatchPublisherService } from '../services/portfolio-watch-publisher.service';
import { PortfolioNewsTool } from '../services/portfolio-news.tool';
import { PortfolioChangesReaderService } from '../services/portfolio-changes-reader.service';
import { PortfolioAgendaApplication } from './portfolio-agenda.application';
import { PortfolioChangesApplication } from './portfolio-changes.application';
import { PortfolioWatchDailyApplication } from './portfolio-watch-daily.application';
import { PortfolioWatchSnapshotApplication } from './portfolio-watch-snapshot.application';

@Module({
    imports: [
        ConfigModule.forFeature(portfolioWatchConfig),
        ContextModule,
        ObservabilityModule,
        QueueModule,
        FixedIncomeServicesModule,
        PortfolioApplicationModule,
        PositionsApplicationModule,
        PortfolioWatchDomainModule,
        CatalogApplicationModule,
        FixedIncomeScheduleApplicationModule,
        NoticesApplicationModule,
        PortfolioEventsApplicationModule,
        MailModule,
        MarketDocumentsApplicationModule,
        PlansApplicationModule
    ],
    providers: [
        PortfolioWatchSnapshotApplication,
        PortfolioWatchDailyApplication,
        PortfolioAgendaApplication,
        PortfolioChangesApplication,
        PortfolioChangesReaderService,
        PortfolioNewsTool,
        PortfolioAgendaService,
        PortfolioWatchNoticeRegistrar,
        PortfolioWatchDigestTemplates,
        PortfolioWeeklyChangesTemplates,
        PortfolioIncomeLedgerService,
        PortfolioWatchAccountEraser,
        PortfolioWatchAccountExporter,
        PortfolioWatchLogService,
        PortfolioWatchPublisherService
    ],
    exports: [
        PortfolioWatchSnapshotApplication,
        PortfolioWatchDailyApplication,
        PortfolioAgendaApplication,
        PortfolioChangesApplication,
        PortfolioChangesReaderService,
        PortfolioIncomeLedgerService
    ]
})
export class PortfolioWatchApplicationModule {}
