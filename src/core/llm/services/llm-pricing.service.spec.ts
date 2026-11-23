import { describe, expect, it, vi } from 'vitest';
import { UsdRateHolder } from '../../usage/ports/usd-rate.holder';
import { LlmConfig } from '../config/llm.config';
import { LlmLogService } from './llm-log.service';
import { LlmPricingService } from './llm-pricing.service';

const MODEL: string = 'vendor/model-a';

function config(mode: 'hosted' | 'self_hosted' = 'hosted'): LlmConfig {
    return {
        LLM_DRIVER: 'live',
        AI_GATEWAY_API_KEY: 'k',
        LLM_MODEL_ID: MODEL,
        LLM_PRICE_TABLE: { [MODEL]: { input: 0.1, output: 0.2, cacheRead: 0.002 } },
        LLM_TIMEOUT_MS: 30_000,
        LLM_MAX_RETRIES: 2,
        LLM_REPEAT_LIMIT: 3,
        DEPLOY_ENV: 'dev',
        DEPLOYMENT_MODE: mode
    };
}

function build(rate: string, mode: 'hosted' | 'self_hosted' = 'hosted') {
    const logs = { unpricedModel: vi.fn() };
    const rates = { current: vi.fn().mockResolvedValue({ rate, date: '2026-11-20', source: 'ptax' }) };
    const service: LlmPricingService = new LlmPricingService(
        config(mode),
        rates as unknown as UsdRateHolder,
        logs as unknown as LlmLogService
    );
    return { service, logs };
}

describe('LlmPricingService', () => {
    it('custa entrada, saída e cache pela tabela e converte pela PTAX', async () => {
        const { service } = build('5.0000');

        const cost: number = await service.costMicros(MODEL, { inputTokens: 1_000_000, outputTokens: 500_000, cacheReadTokens: 1_000_000 });

        expect(cost).toBe(Math.ceil((0.1 + 0.1 + 0.002) * 5 * 1_000_000));
    });

    it('sem cache lido não soma nada pelo cache', async () => {
        const { service } = build('5.0000');

        expect(await service.costMicros(MODEL, { inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 0 })).toBe(500_000);
    });

    it('usa a cotação do dia e não uma fixa', async () => {
        const { service } = build('6.0000');

        expect(await service.costMicros(MODEL, { inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 0 })).toBe(600_000);
    });

    it('arredonda para cima o resto de micro', async () => {
        const { service } = build('5.0000');

        expect(await service.costMicros(MODEL, { inputTokens: 1, outputTokens: 0, cacheReadTokens: 0 })).toBe(1);
    });

    it('modelo sem preço na hospedada custa zero e loga uma vez', async () => {
        const { service, logs } = build('5.0000');

        expect(await service.costMicros('other/model', { inputTokens: 10, outputTokens: 10, cacheReadTokens: 0 })).toBe(0);
        await service.costMicros('other/model', { inputTokens: 10, outputTokens: 10, cacheReadTokens: 0 });

        expect(logs.unpricedModel).toHaveBeenCalledTimes(1);
    });

    it('modelo sem preço na auto-hospedada custa zero sem log', async () => {
        const { service, logs } = build('5.0000', 'self_hosted');

        expect(await service.costMicros('other/model', { inputTokens: 10, outputTokens: 10, cacheReadTokens: 0 })).toBe(0);
        expect(logs.unpricedModel).not.toHaveBeenCalled();
    });

    it('converte o custo em dólar do gateway', async () => {
        const { service } = build('5.0000');

        expect(await service.usdToMicros(0.002)).toBe(10_000);
    });
});
