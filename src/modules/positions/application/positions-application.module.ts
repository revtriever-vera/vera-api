import { Module } from '@nestjs/common';
import { ObservabilityModule } from '../../../core/observability/observability.module';
import { AllocationApplicationModule } from '../../allocation/application/allocation-application.module';
import { CatalogApplicationModule } from '../../catalog/application/catalog-application.module';
import { PositionsDomainModule } from '../domain/positions-domain.module';
import { HeldAssetsService } from '../services/held-assets.service';
import { PositionReaderService } from '../services/position-reader.service';
import { PositionsLogService } from '../services/positions-log.service';
import { PositionsMetricsService } from '../services/positions-metrics.service';
import { PositionApplication } from './position.application';

@Module({
    imports: [PositionsDomainModule, CatalogApplicationModule, AllocationApplicationModule, ObservabilityModule],
    providers: [PositionApplication, PositionsLogService, PositionsMetricsService, PositionReaderService, HeldAssetsService],
    exports: [PositionApplication, PositionReaderService, HeldAssetsService]
})
export class PositionsApplicationModule {}
