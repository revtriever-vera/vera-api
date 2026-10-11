import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../core/database/database.module';
import { ObservabilityModule } from '../../core/observability/observability.module';
import { HealthController } from './health.controller';
import { HealthService } from './services/health.service';
import { ReadinessProbeService } from './services/readiness-probe.service';

@Module({
    imports: [DatabaseModule, ObservabilityModule],
    controllers: [HealthController],
    providers: [HealthService, ReadinessProbeService]
})
export class HealthModule {}
