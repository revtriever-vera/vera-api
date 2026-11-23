import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Decimal, DecimalUtil } from '../../../shared/utils/decimal.util';
import { UsdRateHolder } from '../../usage/ports/usd-rate.holder';
import { UsdRate } from '../../usage/usage.types';
import { llmConfig, LlmModelPrice } from '../config/llm.config';
import { LlmUsage } from '../llm.types';
import { LlmLogService } from './llm-log.service';

const TOKENS_PER_PRICE_UNIT: number = 1_000_000;
const MICROS_PER_UNIT: number = 1_000_000;

@Injectable()
export class LlmPricingService {
    private readonly unpriced: Set<string> = new Set<string>();

    public constructor(
        @Inject(llmConfig.KEY) private readonly config: ConfigType<typeof llmConfig>,
        private readonly rates: UsdRateHolder,
        private readonly logs: LlmLogService
    ) {}

    public async costMicros(modelId: string, usage: LlmUsage): Promise<number> {
        const price: LlmModelPrice | undefined = this.config.LLM_PRICE_TABLE[modelId];
        if (price === undefined) {
            this.warnUnpriced(modelId);
            return 0;
        }
        const usd: Decimal = DecimalUtil.of(usage.inputTokens)
            .mul(price.input)
            .plus(DecimalUtil.of(usage.outputTokens).mul(price.output))
            .plus(DecimalUtil.of(usage.cacheReadTokens).mul(price.cacheRead))
            .div(TOKENS_PER_PRICE_UNIT);
        return this.toMicros(usd.toFixed());
    }

    public async usdToMicros(usd: number): Promise<number> {
        return this.toMicros(String(usd));
    }

    private async toMicros(usd: string): Promise<number> {
        const rate: UsdRate = await this.rates.current();
        return DecimalUtil.of(usd).mul(rate.rate).mul(MICROS_PER_UNIT).ceil().toNumber();
    }

    private warnUnpriced(modelId: string): void {
        if (this.config.DEPLOYMENT_MODE !== 'hosted' || this.unpriced.has(modelId)) {
            return;
        }
        this.unpriced.add(modelId);
        this.logs.unpricedModel(modelId);
    }
}
