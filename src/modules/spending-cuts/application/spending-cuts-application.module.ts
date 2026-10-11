import { Module } from '@nestjs/common';
import { ObservabilityModule } from '../../../core/observability/observability.module';
import { SpendingSummaryApplicationModule } from '../../spending-summary/application/spending-summary-application.module';
import { SpendingCutsLogService } from '../services/spending-cuts-log.service';
import { SpendingCutsMetricsService } from '../services/spending-cuts-metrics.service';
import { CutsApplication } from './cuts.application';

@Module({
    imports: [SpendingSummaryApplicationModule, ObservabilityModule],
    providers: [CutsApplication, SpendingCutsLogService, SpendingCutsMetricsService],
    exports: [CutsApplication]
})
export class SpendingCutsApplicationModule {}
