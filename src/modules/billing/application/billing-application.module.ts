import { Module } from '@nestjs/common';
import { ConfigModule, ConfigType } from '@nestjs/config';
import { MailModule } from '../../../core/mail/mail.module';
import { ObservabilityModule } from '../../../core/observability/observability.module';
import { QueueModule } from '../../../core/queue/queue.module';
import { IdentityApplicationModule } from '../../identity/application/identity-application.module';
import { PlansApplicationModule } from '../../plans/application/plans-application.module';
import { billingConfig } from '../config/billing.config';
import { billingEngineFactory } from '../drivers/billing-engine.factory';
import { FakeBillingEngineDriver } from '../drivers/fake-billing-engine.driver';
import { FakeEventDelivery } from '../drivers/fake-event-delivery.service';
import { RevtrieverBillingEngineDriver } from '../drivers/revtriever/revtriever-billing-engine.driver';
import { BillingDomainModule } from '../domain/billing-domain.module';
import { BillingEnginePort } from '../ports/billing-engine.port';
import { BillingAccountEraser } from '../services/billing-account.eraser';
import { BillingAccountExporter } from '../services/billing-account.exporter';
import { BillingCancellationService } from '../services/billing-cancellation.service';
import { BillingCardService } from '../services/billing-card.service';
import { BillingCheckoutService } from '../services/billing-checkout.service';
import { BillingPendingCancellationService } from '../services/billing-pending-cancellation.service';
import { BillingReplayService } from '../services/billing-replay.service';
import { BillingSweepService } from '../services/billing-sweep.service';
import { BillingLogService } from '../services/billing-log.service';
import { BillingMailerService } from '../services/billing-mailer.service';
import { BillingMetricsService } from '../services/billing-metrics.service';
import { BillingProvisioningService } from '../services/billing-provisioning.service';
import { BillingStandingService } from '../services/billing-standing.service';
import { BillingSubscriptionSummary } from '../services/billing-subscription-summary';
import { BillingViewMapper } from '../services/billing-view.mapper';
import { RevtrieverEventIngestService } from '../services/revtriever-event-ingest.service';
import { RevtrieverEventProcessor } from '../services/revtriever-event-processor.service';
import { RevtrieverWebhookVerifier } from '../services/revtriever-webhook-verifier.service';
import { BillingTemplates } from '../templates/billing.templates';
import { BillingDevApplication } from './billing-dev.application';
import { BillingEventsApplication } from './billing-events.application';
import { InvoicesApplication } from './invoices.application';
import { SubscriptionApplication } from './subscription.application';

@Module({
    imports: [
        ConfigModule.forFeature(billingConfig),
        ObservabilityModule,
        BillingDomainModule,
        PlansApplicationModule,
        IdentityApplicationModule,
        MailModule,
        QueueModule
    ],
    providers: [
        BillingLogService,
        BillingMetricsService,
        FakeEventDelivery,
        FakeBillingEngineDriver,
        RevtrieverBillingEngineDriver,
        BillingDevApplication,
        SubscriptionApplication,
        InvoicesApplication,
        BillingEventsApplication,
        BillingProvisioningService,
        BillingCheckoutService,
        BillingCancellationService,
        BillingCardService,
        BillingPendingCancellationService,
        BillingReplayService,
        BillingSweepService,
        BillingMailerService,
        BillingStandingService,
        BillingViewMapper,
        RevtrieverWebhookVerifier,
        RevtrieverEventIngestService,
        RevtrieverEventProcessor,
        BillingSubscriptionSummary,
        BillingAccountEraser,
        BillingAccountExporter,
        BillingTemplates,
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
    exports: [
        BillingEnginePort,
        BillingDevApplication,
        SubscriptionApplication,
        InvoicesApplication,
        BillingEventsApplication,
        BillingViewMapper
    ]
})
export class BillingApplicationModule {}
