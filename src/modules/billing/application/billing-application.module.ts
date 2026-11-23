import { Module } from '@nestjs/common';
import { ConfigModule, ConfigType } from '@nestjs/config';
import { ObservabilityModule } from '../../../core/observability/observability.module';
import { billingConfig } from '../config/billing.config';
import { billingEngineFactory } from '../drivers/billing-engine.factory';
import { FakeBillingEngineDriver } from '../drivers/fake-billing-engine.driver';
import { FakeEventDelivery } from '../drivers/fake-event-delivery.service';
import { RevtrieverBillingEngineDriver } from '../drivers/revtriever/revtriever-billing-engine.driver';
import { BillingEnginePort } from '../ports/billing-engine.port';
import { BillingLogService } from '../services/billing-log.service';
import { BillingMetricsService } from '../services/billing-metrics.service';
import { BillingDevApplication } from './billing-dev.application';

@Module({
    imports: [ConfigModule.forFeature(billingConfig), ObservabilityModule],
    providers: [
        BillingLogService,
        BillingMetricsService,
        FakeEventDelivery,
        FakeBillingEngineDriver,
        RevtrieverBillingEngineDriver,
        BillingDevApplication,
        {
            provide: BillingEnginePort,
            inject: [billingConfig.KEY, FakeBillingEngineDriver, RevtrieverBillingEngineDriver, BillingLogService, BillingMetricsService],
            useFactory: (
                config: ConfigType<typeof billingConfig>,
                fake: FakeBillingEngineDriver,
                revtriever: RevtrieverBillingEngineDriver,
                logs: BillingLogService,
                metrics: BillingMetricsService
            ): BillingEnginePort => billingEngineFactory(config, fake, revtriever, logs, metrics)
        }
    ],
    exports: [BillingEnginePort, BillingDevApplication]
})
export class BillingApplicationModule {}
