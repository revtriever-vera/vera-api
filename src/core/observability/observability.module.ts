import { Module } from '@nestjs/common';
import { ContextModule } from '../context/context.module';
import { LogService } from './log.service';
import { MetricsService } from './metrics.service';
import { TracingService } from './tracing.service';

@Module({
    imports: [ContextModule],
    providers: [LogService, MetricsService, TracingService],
    exports: [LogService, MetricsService, TracingService]
})
export class ObservabilityModule {}
