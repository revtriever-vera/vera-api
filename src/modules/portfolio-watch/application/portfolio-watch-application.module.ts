import { Module } from '@nestjs/common';
import { ContextModule } from '../../../core/context/context.module';
import { ObservabilityModule } from '../../../core/observability/observability.module';
import { QueueModule } from '../../../core/queue/queue.module';
import { FixedIncomeServicesModule } from '../../fixed-income/services/fixed-income-services.module';
import { CatalogApplicationModule } from '../../catalog/application/catalog-application.module';
import { FixedIncomeScheduleApplicationModule } from '../../fixed-income-schedule/application/fixed-income-schedule-application.module';
import { NoticesApplicationModule } from '../../notices/application/notices-application.module';
import { PortfolioApplicationModule } from '../../portfolio/application/portfolio-application.module';
import { PortfolioEventsApplicationModule } from '../../portfolio-events/application/portfolio-events-application.module';
import { PositionsApplicationModule } from '../../positions/application/positions-application.module';
import { PortfolioWatchDomainModule } from '../domain/portfolio-watch-domain.module';
import { MailModule } from '../../../core/mail/mail.module';
import { PortfolioAgendaService } from '../services/portfolio-agenda.service';
import { PortfolioIncomeLedgerService } from '../services/portfolio-income-ledger.service';
import { PortfolioWatchAccountEraser } from '../services/portfolio-watch-account.eraser';
import { PortfolioWatchAccountExporter } from '../services/portfolio-watch-account.exporter';
import { PortfolioWatchDigestTemplates } from '../services/portfolio-watch-digest.templates';
import { PortfolioWatchLogService } from '../services/portfolio-watch-log.service';
import { PortfolioWatchNoticeRegistrar } from '../services/portfolio-watch-notice.registrar';
import { PortfolioWatchPublisherService } from '../services/portfolio-watch-publisher.service';
import { PortfolioAgendaApplication } from './portfolio-agenda.application';
import { PortfolioWatchDailyApplication } from './portfolio-watch-daily.application';
import { PortfolioWatchSnapshotApplication } from './portfolio-watch-snapshot.application';

@Module({
    imports: [
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
        MailModule
    ],
    providers: [
        PortfolioWatchSnapshotApplication,
        PortfolioWatchDailyApplication,
        PortfolioAgendaApplication,
        PortfolioAgendaService,
        PortfolioWatchNoticeRegistrar,
        PortfolioWatchDigestTemplates,
        PortfolioIncomeLedgerService,
        PortfolioWatchAccountEraser,
        PortfolioWatchAccountExporter,
        PortfolioWatchLogService,
        PortfolioWatchPublisherService
    ],
    exports: [PortfolioWatchSnapshotApplication, PortfolioWatchDailyApplication, PortfolioAgendaApplication, PortfolioIncomeLedgerService]
})
export class PortfolioWatchApplicationModule {}
