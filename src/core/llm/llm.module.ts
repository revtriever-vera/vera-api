import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ObservabilityModule } from '../observability/observability.module';
import { UsageModule } from '../usage/usage.module';
import { llmConfig } from './config/llm.config';
import { LlmDomainModule } from './domain/llm-domain.module';
import { GatewayLlmDriver } from './drivers/gateway-llm.driver';
import { LlmDriverRouter } from './drivers/llm-driver-router';
import { MeteredLlmDriver } from './drivers/metered-llm.driver';
import { MockLlmDriver } from './drivers/mock-llm.driver';
import { OpenAiCompatibleLlmDriver } from './drivers/openai-compatible-llm.driver';
import { LlmBootCheck } from './llm-boot-check';
import { LlmPort } from './llm.port';
import { ConfigLlmCredentialsAdapter } from './ports/config-llm-credentials.adapter';
import { LlmCredentialsPort } from './ports/llm-credentials.port';
import { LlmAvailabilityService } from './services/llm-availability.service';
import { LlmCallsHistoryService } from './services/llm-calls-history.service';
import { LlmLedgerService } from './services/llm-ledger.service';
import { LlmLogService } from './services/llm-log.service';
import { LlmMetricsService } from './services/llm-metrics.service';
import { LlmPricingService } from './services/llm-pricing.service';
import { LlmProbeService } from './services/llm-probe.service';
import { LlmTaskRegistryService } from './services/llm-task-registry.service';

@Module({
    imports: [ConfigModule.forFeature(llmConfig), ObservabilityModule, LlmDomainModule, UsageModule],
    providers: [
        GatewayLlmDriver,
        OpenAiCompatibleLlmDriver,
        MockLlmDriver,
        LlmDriverRouter,
        MeteredLlmDriver,
        { provide: LlmPort, useExisting: MeteredLlmDriver },
        { provide: LlmCredentialsPort, useClass: ConfigLlmCredentialsAdapter },
        LlmLogService,
        LlmMetricsService,
        LlmPricingService,
        LlmTaskRegistryService,
        LlmLedgerService,
        LlmAvailabilityService,
        LlmProbeService,
        LlmCallsHistoryService,
        LlmBootCheck
    ],
    exports: [LlmPort, LlmCredentialsPort, LlmAvailabilityService, LlmProbeService, LlmCallsHistoryService, MockLlmDriver]
})
export class LlmModule {}
