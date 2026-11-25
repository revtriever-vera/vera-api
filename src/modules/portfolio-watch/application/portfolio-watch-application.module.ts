import { Module } from '@nestjs/common';
import { ContextModule } from '../../../core/context/context.module';
import { ObservabilityModule } from '../../../core/observability/observability.module';
import { QueueModule } from '../../../core/queue/queue.module';
import { FixedIncomeServicesModule } from '../../fixed-income/services/fixed-income-services.module';
import { PortfolioApplicationModule } from '../../portfolio/application/portfolio-application.module';
import { PositionsApplicationModule } from '../../positions/application/positions-application.module';
import { PortfolioWatchDomainModule } from '../domain/portfolio-watch-domain.module';
import { PortfolioIncomeLedgerService } from '../services/portfolio-income-ledger.service';
import { PortfolioWatchAccountEraser } from '../services/portfolio-watch-account.eraser';
import { PortfolioWatchAccountExporter } from '../services/portfolio-watch-account.exporter';
import { PortfolioWatchLogService } from '../services/portfolio-watch-log.service';
import { PortfolioWatchPublisherService } from '../services/portfolio-watch-publisher.service';
import { PortfolioWatchSnapshotApplication } from './portfolio-watch-snapshot.application';

@Module({
    imports: [
        ContextModule,
        ObservabilityModule,
        QueueModule,
        FixedIncomeServicesModule,
        PortfolioApplicationModule,
        PositionsApplicationModule,
        PortfolioWatchDomainModule
    ],
    providers: [
        PortfolioWatchSnapshotApplication,
        PortfolioIncomeLedgerService,
        PortfolioWatchAccountEraser,
        PortfolioWatchAccountExporter,
        PortfolioWatchLogService,
        PortfolioWatchPublisherService
    ],
    exports: [PortfolioWatchSnapshotApplication, PortfolioIncomeLedgerService]
})
export class PortfolioWatchApplicationModule {}
