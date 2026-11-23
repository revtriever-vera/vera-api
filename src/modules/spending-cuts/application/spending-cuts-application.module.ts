import { Module } from '@nestjs/common';
import { ObservabilityModule } from '../../../core/observability/observability.module';
import { GoalsApplicationModule } from '../../goals/application/goals-application.module';
import { SpendingSummaryApplicationModule } from '../../spending-summary/application/spending-summary-application.module';
import { SpendingCutsService } from '../services/spending-cuts.service';
import { SpendingCutsLogService } from '../services/spending-cuts-log.service';
import { SpendingCutsMetricsService } from '../services/spending-cuts-metrics.service';
import { CutsApplication } from './cuts.application';

@Module({
    imports: [SpendingSummaryApplicationModule, GoalsApplicationModule, ObservabilityModule],
    providers: [CutsApplication, SpendingCutsService, SpendingCutsLogService, SpendingCutsMetricsService],
    exports: [CutsApplication, SpendingCutsService]
})
export class SpendingCutsApplicationModule {}
