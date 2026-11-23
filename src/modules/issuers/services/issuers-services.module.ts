import { Module } from '@nestjs/common';
import { ObservabilityModule } from '../../../core/observability/observability.module';
import { IssuerDirectoryService } from './issuer-directory.service';
import { IssuersLogService } from './issuers-log.service';
import { IssuersMetricsService } from './issuers-metrics.service';

@Module({
    imports: [ObservabilityModule],
    providers: [IssuerDirectoryService, IssuersLogService, IssuersMetricsService],
    exports: [IssuerDirectoryService, IssuersMetricsService]
})
export class IssuersServicesModule {}
