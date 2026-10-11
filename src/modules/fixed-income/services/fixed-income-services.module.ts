import { Module } from '@nestjs/common';
import { ObservabilityModule } from '../../../core/observability/observability.module';
import { FixedIncomeDomainModule } from '../domain/fixed-income-domain.module';
import { FixedIncomeAccountExporter } from './fixed-income-account.exporter';
import { FixedIncomeLogService } from './fixed-income-log.service';
import { FixedIncomeMetricsService } from './fixed-income-metrics.service';
import { FixedIncomeValuationService } from './fixed-income-valuation.service';

@Module({
    imports: [FixedIncomeDomainModule, ObservabilityModule],
    providers: [FixedIncomeAccountExporter, FixedIncomeLogService, FixedIncomeMetricsService, FixedIncomeValuationService],
    exports: [FixedIncomeLogService, FixedIncomeMetricsService, FixedIncomeValuationService]
})
export class FixedIncomeServicesModule {}
