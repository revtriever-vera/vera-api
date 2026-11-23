import { Module } from '@nestjs/common';
import { ObservabilityModule } from '../../../core/observability/observability.module';
import { IssuersServicesModule } from '../../issuers/services/issuers-services.module';
import { PortfolioApplicationModule } from '../../portfolio/application/portfolio-application.module';
import { ConcentrationLogService } from '../services/concentration-log.service';
import { ConcentrationMetricsService } from '../services/concentration-metrics.service';
import { ConcentrationApplication } from './concentration.application';

@Module({
    imports: [ObservabilityModule, PortfolioApplicationModule, IssuersServicesModule],
    providers: [ConcentrationApplication, ConcentrationLogService, ConcentrationMetricsService],
    exports: [ConcentrationApplication]
})
export class ConcentrationApplicationModule {}
