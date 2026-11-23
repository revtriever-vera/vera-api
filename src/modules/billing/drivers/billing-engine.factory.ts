import { Logger } from '@nestjs/common';
import { BillingSettings } from '../config/billing.config';
import { BillingEnginePort } from '../ports/billing-engine.port';
import { BillingCatalogPort } from '../ports/billing-catalog.port';
import { BillingLogService } from '../services/billing-log.service';
import { BillingMetricsService } from '../services/billing-metrics.service';
import { FakeBillingCatalog } from './fake-billing-catalog';
import { FakeBillingEngineDriver } from './fake-billing-engine.driver';
import { ObservedBillingEngine } from './observed-billing-engine';
import { RevtrieverBillingEngineDriver } from './revtriever/revtriever-billing-engine.driver';
import { RevtrieverCatalogClient } from './revtriever/revtriever-catalog.client';
import { RevtrieverHttp } from './revtriever/revtriever-http';

export function billingEngineFactory(
    config: BillingSettings,
    fake: FakeBillingEngineDriver,
    revtriever: RevtrieverBillingEngineDriver,
    logs: BillingLogService,
    metrics: BillingMetricsService
): BillingEnginePort {
    if (config.BILLING_FAKE_REFUSED) {
        new Logger('Billing').warn(
            'BILLING_ENGINE_DRIVER=fake é recusado fora do local: cobrança desligada (503 billing.provider_disabled)'
        );
    } else if (!config.BILLING_ENGINE_ENABLED) {
        new Logger('Billing').warn('Motor de cobrança sem configuração completa: cobrança desligada (503 billing.provider_disabled)');
    }
    return new ObservedBillingEngine(config.BILLING_ENGINE_DRIVER === 'fake' ? fake : revtriever, logs, metrics);
}

export function billingCatalogFactory(config: BillingSettings): BillingCatalogPort {
    if (config.BILLING_ENGINE_DRIVER === 'fake') {
        return new FakeBillingCatalog();
    }
    if (config.REVTRIEVER_API_KEY === null) {
        throw new Error('REVTRIEVER_API_KEY é obrigatório para provisionar o catálogo na Revtriever');
    }
    return new RevtrieverCatalogClient(
        new RevtrieverHttp({
            baseUrl: config.REVTRIEVER_API_URL,
            apiKey: config.REVTRIEVER_API_KEY,
            timeoutMs: config.REVTRIEVER_TIMEOUT_MS,
            maxRetries: config.REVTRIEVER_MAX_RETRIES
        })
    );
}
