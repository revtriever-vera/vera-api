import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ContextModule } from '../context/context.module';
import { ObservabilityModule } from '../observability/observability.module';
import { QueueModule } from '../queue/queue.module';
import { usageConfig } from './config/usage.config';
import { UsageDomainModule } from './domain/usage-domain.module';
import { UsageContextHolder } from './ports/usage-context.holder';
import { UsdRateHolder } from './ports/usd-rate.holder';
import { PaidSendMeter } from './services/paid-send-meter.service';
import { PaidUsageHistoryService } from './services/paid-usage-history.service';
import { PaidUsageMeter } from './services/paid-usage-meter.service';
import { UsageCompaniesGaugeService } from './services/usage-companies-gauge.service';
import { UsageLogService } from './services/usage-log.service';
import { UsageMetricsService } from './services/usage-metrics.service';
import { UsageSnapshotService } from './services/usage-snapshot.service';

@Module({
    imports: [ConfigModule.forFeature(usageConfig), UsageDomainModule, ObservabilityModule, QueueModule, ContextModule],
    providers: [
        UsageContextHolder,
        UsdRateHolder,
        UsageLogService,
        UsageMetricsService,
        UsageSnapshotService,
        PaidUsageMeter,
        PaidSendMeter,
        PaidUsageHistoryService,
        UsageCompaniesGaugeService
    ],
    exports: [UsageContextHolder, UsdRateHolder, PaidUsageMeter, PaidSendMeter, PaidUsageHistoryService, UsageCompaniesGaugeService]
})
export class UsageModule {}
