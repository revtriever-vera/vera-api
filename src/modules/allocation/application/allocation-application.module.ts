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
import { AssetClassApplication } from './asset-class.application';
import { ClassAssignmentApplication } from './class-assignment.application';

@Module({
    imports: [AllocationDomainModule, ContextModule, ObservabilityModule],
    providers: [
        AssetClassApplication,
        ClassAssignmentApplication,
        AllocationLogService,
        AllocationMetricsService,
        ClassAssignmentService,
        ClassResolverService,
        ClassReaderService,
        ClassDisplayNameService
    ],
    exports: [
        AssetClassApplication,
        ClassAssignmentApplication,
        ClassAssignmentService,
        ClassResolverService,
        ClassReaderService,
        ClassDisplayNameService
    ]
})
export class AllocationApplicationModule {}
