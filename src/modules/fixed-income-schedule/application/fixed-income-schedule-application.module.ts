import { Module } from '@nestjs/common';
import { ObservabilityModule } from '../../../core/observability/observability.module';
import { CatalogApplicationModule } from '../../catalog/application/catalog-application.module';
import { FixedIncomeServicesModule } from '../../fixed-income/services/fixed-income-services.module';
import { IssuersServicesModule } from '../../issuers/services/issuers-services.module';
import { MarketDataApplicationModule } from '../../market-data/application/market-data-application.module';
import { PositionsApplicationModule } from '../../positions/application/positions-application.module';
import { MaturitiesReaderService } from '../services/maturities-reader.service';
import { RealRatesReaderService } from '../services/real-rates-reader.service';
import { ScheduleLogService } from '../services/schedule-log.service';
import { ScheduleMetricsService } from '../services/schedule-metrics.service';
import { ScheduleSourceService } from '../services/schedule-source.service';
import { MaturitiesApplication } from './maturities.application';
import { RealRatesApplication } from './real-rates.application';

@Module({
    imports: [
        ObservabilityModule,
        FixedIncomeServicesModule,
        IssuersServicesModule,
        PositionsApplicationModule,
        CatalogApplicationModule,
        MarketDataApplicationModule
    ],
    providers: [
        MaturitiesApplication,
        MaturitiesReaderService,
        RealRatesApplication,
        RealRatesReaderService,
        ScheduleSourceService,
        ScheduleLogService,
        ScheduleMetricsService
    ],
    exports: [MaturitiesApplication, MaturitiesReaderService, RealRatesApplication, RealRatesReaderService, ScheduleSourceService]
})
export class FixedIncomeScheduleApplicationModule {}
