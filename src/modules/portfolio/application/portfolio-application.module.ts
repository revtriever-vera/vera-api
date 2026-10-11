import { Module } from '@nestjs/common';
import { ContextModule } from '../../../core/context/context.module';
import { ObservabilityModule } from '../../../core/observability/observability.module';
import { AllocationApplicationModule } from '../../allocation/application/allocation-application.module';
import { CatalogApplicationModule } from '../../catalog/application/catalog-application.module';
import { FixedIncomeApplicationModule } from '../../fixed-income/application/fixed-income-application.module';
import { MarketDataApplicationModule } from '../../market-data/application/market-data-application.module';
import { PositionsApplicationModule } from '../../positions/application/positions-application.module';
import { ModulesPortfolioSourceDriver } from '../drivers/modules-portfolio-source.driver';
import { PortfolioSourcePort } from '../ports/portfolio-source.port';
import { PortfolioClassInputsService } from '../services/portfolio-class-inputs.service';
import { PortfolioLogService } from '../services/portfolio-log.service';
import { PortfolioMetricsService } from '../services/portfolio-metrics.service';
import { PortfolioSnapshotService } from '../services/portfolio-snapshot.service';
import { PortfolioViewApplication } from './portfolio-view.application';

@Module({
    imports: [
        ContextModule,
        ObservabilityModule,
        AllocationApplicationModule,
        CatalogApplicationModule,
        FixedIncomeApplicationModule,
        MarketDataApplicationModule,
        PositionsApplicationModule
    ],
    providers: [
        PortfolioViewApplication,
        PortfolioSnapshotService,
        PortfolioClassInputsService,
        PortfolioLogService,
        PortfolioMetricsService,
        ModulesPortfolioSourceDriver,
        { provide: PortfolioSourcePort, useExisting: ModulesPortfolioSourceDriver }
    ],
    exports: [PortfolioViewApplication, PortfolioSnapshotService]
})
export class PortfolioApplicationModule {}
