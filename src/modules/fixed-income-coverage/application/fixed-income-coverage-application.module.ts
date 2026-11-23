import { Module } from '@nestjs/common';
import { ObservabilityModule } from '../../../core/observability/observability.module';
import { FixedIncomeScheduleApplicationModule } from '../../fixed-income-schedule/application/fixed-income-schedule-application.module';
import { FixedIncomeServicesModule } from '../../fixed-income/services/fixed-income-services.module';
import { IssuersServicesModule } from '../../issuers/services/issuers-services.module';
import { FgcCoverageService } from '../services/fgc-coverage.service';
import { FgcLogService } from '../services/fgc-log.service';
import { FgcMetricsService } from '../services/fgc-metrics.service';
import { FgcCoverageApplication } from './fgc-coverage.application';
import { FgcSimulationApplication } from './fgc-simulation.application';

@Module({
    imports: [ObservabilityModule, FixedIncomeServicesModule, FixedIncomeScheduleApplicationModule, IssuersServicesModule],
    providers: [FgcCoverageApplication, FgcSimulationApplication, FgcCoverageService, FgcLogService, FgcMetricsService],
    exports: [FgcCoverageApplication, FgcSimulationApplication, FgcCoverageService]
})
export class FixedIncomeCoverageApplicationModule {}
