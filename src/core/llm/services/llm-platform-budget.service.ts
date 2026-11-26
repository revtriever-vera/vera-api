import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { DateUtil } from '../../../shared/utils/date.util';
import { CapReachedError } from '../../usage/usage.errors';
import { llmConfig } from '../config/llm.config';
import { LlmCallDomain } from '../domain/llm-call.domain';
import { LlmFeature } from '../llm.types';
import { LlmPricingService } from './llm-pricing.service';

const DAILY_CAP_USD: number = 2;

@Injectable()
export class LlmPlatformBudgetService {
    public constructor(
        @Inject(llmConfig.KEY) private readonly config: ConfigType<typeof llmConfig>,
        private readonly calls: LlmCallDomain,
        private readonly pricing: LlmPricingService
    ) {}

    public async capMicros(): Promise<number> {
        return this.config.MARKET_DOCS_DAILY_CAP_MICROS ?? (await this.pricing.usdToMicros(DAILY_CAP_USD));
    }

    public async assertRoom(feature: LlmFeature, estimateMicros: number, now: Date = new Date()): Promise<void> {
        const used: number = await this.calls.platformCostSince(feature, DateUtil.startOfDayIn(DateUtil.BRAZIL_TIMEZONE, now));
        if (used + estimateMicros <= (await this.capMicros())) {
            return;
        }
        throw new CapReachedError(feature, DateUtil.startOfNextDayIn(DateUtil.BRAZIL_TIMEZONE, now).toISOString());
    }
}
