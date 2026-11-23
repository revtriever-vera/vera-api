import { describe, expect, it, vi } from 'vitest';
import { UsdRateHolder } from '../ports/usd-rate.holder';
import { PaidUsageLlmAdapter } from './paid-usage-llm.adapter';
import { PaidUsageMeter } from './paid-usage-meter.service';

function build() {
    const meter = { assertRoom: vi.fn().mockResolvedValue(undefined), record: vi.fn().mockResolvedValue(undefined) };
    const rates = { current: vi.fn().mockResolvedValue({ rate: '5.1234', date: '2026-11-20', source: 'ptax' }) };
    return { adapter: new PaidUsageLlmAdapter(meter as unknown as PaidUsageMeter, rates as unknown as UsdRateHolder), meter };
}

describe('PaidUsageLlmAdapter', () => {
    it('a folga é a do medidor', async () => {
        const { adapter, meter } = build();

        await adapter.assertRoom({ feature: 'ai', task: 'summary_month', estimateMicros: 9 });

        expect(meter.assertRoom).toHaveBeenCalledWith({ feature: 'ai', task: 'summary_month', estimateMicros: 9 });
    });

    it('lança o custo no razão com a cotação do dia e o detalhe permitido', async () => {
        const { adapter, meter } = build();

        await adapter.record({
            feature: 'ai',
            task: 'summary_month',
            referenceId: 'c1',
            costMicros: 100,
            providerCostMicros: 90,
            estimateMicros: 200,
            detail: { model: 'vendor/model-a', inputTokens: 10, outputTokens: 5, extra: 'x' }
        });

        expect(meter.record).toHaveBeenCalledWith({
            feature: 'ai',
            task: 'summary_month',
            referenceId: 'c1',
            costMicros: 100,
            outcome: 'answered',
            usdBrlRate: '5.1234',
            providerCostMicros: 90,
            estimateMicros: 200,
            detail: { model: 'vendor/model-a', inputTokens: 10, outputTokens: 5 }
        });
    });

    it('não repassa um nome de modelo fora do padrão do detalhe e aceita não respondida sem detalhe', async () => {
        const { adapter, meter } = build();

        await adapter.record({
            feature: 'ai',
            task: 't',
            referenceId: 'c2',
            costMicros: 0,
            outcome: 'unanswered',
            detail: { model: 'Qwen 2.5 7B (local)' }
        });
        await adapter.record({ feature: 'ai', task: 't', referenceId: 'c3', costMicros: 0 });

        expect(meter.record.mock.calls[0]?.[0]).toMatchObject({ outcome: 'unanswered', detail: {} });
        expect(meter.record.mock.calls[1]?.[0]).not.toHaveProperty('detail');
    });
});
