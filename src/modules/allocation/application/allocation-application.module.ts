import { Module } from '@nestjs/common';
import { ContextModule } from '../../../core/context/context.module';
import { ObservabilityModule } from '../../../core/observability/observability.module';
import { AllocationDomainModule } from '../domain/allocation-domain.module';
import { AllocationLogService } from '../services/allocation-log.service';
import { AllocationMetricsService } from '../services/allocation-metrics.service';
import { ClassAssignmentService } from '../services/class-assignment.service';
import { ClassDisplayNameService } from '../services/class-display-name.service';
import { ClassReaderService } from '../services/class-reader.service';
import { ClassResolverService } from '../services/class-resolver.service';
import { PortfolioSettingsReaderService } from '../services/portfolio-settings-reader.service';
import { AssetClassApplication } from './asset-class.application';
import { ClassAssignmentApplication } from './class-assignment.application';
import { ClassTargetsApplication } from './class-targets.application';
import { PortfolioSettingsApplication } from './portfolio-settings.application';

@Module({
    imports: [AllocationDomainModule, ContextModule, ObservabilityModule],
    providers: [
        AssetClassApplication,
        ClassAssignmentApplication,
        ClassTargetsApplication,
        PortfolioSettingsApplication,
        AllocationLogService,
        AllocationMetricsService,
        ClassAssignmentService,
        ClassResolverService,
        ClassReaderService,
        ClassDisplayNameService,
        PortfolioSettingsReaderService
    ],
    exports: [
        AssetClassApplication,
        ClassAssignmentApplication,
        ClassTargetsApplication,
        PortfolioSettingsApplication,
        ClassAssignmentService,
        ClassResolverService,
        ClassReaderService,
        ClassDisplayNameService,
        PortfolioSettingsReaderService
    ]
})
export class AllocationApplicationModule {}
