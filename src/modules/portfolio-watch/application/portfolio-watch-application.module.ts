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
import { AiAssistantApplicationModule } from '../../ai-assistant/application/ai-assistant-application.module';
import { AllocationApplicationModule } from '../../allocation/application/allocation-application.module';
import { MonthlyReviewAnnouncerService } from '../services/monthly-review-announcer.service';
import { MonthlyReviewSourceService } from '../services/monthly-review-source.service';
import { MonthlyReviewNarrativeService } from '../services/monthly-review-narrative.service';
import { PortfolioMonthlyReviewTemplates } from '../services/portfolio-monthly-review.templates';
import { PortfolioWeeklyChangesTemplates } from '../services/portfolio-weekly-changes.templates';
import { PortfolioWatchDigestTemplates } from '../services/portfolio-watch-digest.templates';
import { PortfolioWatchLogService } from '../services/portfolio-watch-log.service';
import { PortfolioWatchNoticeRegistrar } from '../services/portfolio-watch-notice.registrar';
import { PortfolioWatchPublisherService } from '../services/portfolio-watch-publisher.service';
import { PortfolioNewsTool } from '../services/portfolio-news.tool';
import { PortfolioChangesReaderService } from '../services/portfolio-changes-reader.service';
import { MonthlyReviewBenchmarksService } from '../services/monthly-review-benchmarks.service';
import { MonthlyReviewConcentrationService } from '../services/monthly-review-concentration.service';
import { MonthlyReviewService } from '../services/monthly-review.service';
import { ConcentrationApplicationModule } from '../../concentration/application/concentration-application.module';
import { FixedIncomeCoverageApplicationModule } from '../../fixed-income-coverage/application/fixed-income-coverage-application.module';
import { MarketBenchmarksApplicationModule } from '../../market-benchmarks/application/market-benchmarks-application.module';
import { PortfolioMonthlyReviewApplication } from './portfolio-monthly-review.application';
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
        PlansApplicationModule,
        ConcentrationApplicationModule,
        FixedIncomeCoverageApplicationModule,
        MarketBenchmarksApplicationModule,
        AiAssistantApplicationModule,
        AllocationApplicationModule
    ],
    providers: [
        PortfolioWatchSnapshotApplication,
        PortfolioMonthlyReviewApplication,
        MonthlyReviewService,
        MonthlyReviewNarrativeService,
        MonthlyReviewSourceService,
        MonthlyReviewAnnouncerService,
        PortfolioMonthlyReviewTemplates,
        MonthlyReviewBenchmarksService,
        MonthlyReviewConcentrationService,
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
        PortfolioMonthlyReviewApplication,
        PortfolioWatchDailyApplication,
        PortfolioAgendaApplication,
        PortfolioChangesApplication,
        PortfolioChangesReaderService,
        PortfolioIncomeLedgerService
    ]
})
export class PortfolioWatchApplicationModule {}
