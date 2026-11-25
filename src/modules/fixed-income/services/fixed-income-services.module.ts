import { Module } from '@nestjs/common';
import { ObservabilityModule } from '../../../core/observability/observability.module';
import { FixedIncomeDomainModule } from '../domain/fixed-income-domain.module';
import { FixedIncomeAccountExporter } from './fixed-income-account.exporter';
import { FixedIncomeHolderDepartureHandler } from './holder-departure.handler';
import { FixedIncomeCompaniesService } from './fixed-income-companies.service';
import { FixedIncomeLogService } from './fixed-income-log.service';
import { FixedIncomeMetricsService } from './fixed-income-metrics.service';
import { IndexSeriesReaderService } from './index-series-reader.service';
import { FixedIncomeValuationService } from './fixed-income-valuation.service';

@Module({
    imports: [FixedIncomeDomainModule, ObservabilityModule],
    providers: [
        FixedIncomeAccountExporter,
        FixedIncomeCompaniesService,
        FixedIncomeHolderDepartureHandler,
        FixedIncomeLogService,
        FixedIncomeMetricsService,
        FixedIncomeValuationService,
        IndexSeriesReaderService
    ],
    exports: [
        FixedIncomeCompaniesService,
        FixedIncomeLogService,
        FixedIncomeMetricsService,
        FixedIncomeValuationService,
        IndexSeriesReaderService
    ]
})
export class FixedIncomeServicesModule {}
