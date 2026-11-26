import { describe, expect, it, vi } from 'vitest';
import { CapReachedError } from '../../usage/usage.errors';
import { LlmCallDomain } from '../domain/llm-call.domain';
import { LlmPlatformBudgetService } from './llm-platform-budget.service';
import { LlmPricingService } from './llm-pricing.service';

const NOW: Date = new Date('2026-11-25T15:00:00Z');

function build(used: number, cap: number | undefined) {
    const calls = { platformCostSince: vi.fn().mockResolvedValue(used) };
    const pricing = { usdToMicros: vi.fn().mockResolvedValue(10_000_000) };
    const service: LlmPlatformBudgetService = new LlmPlatformBudgetService(
        { MARKET_DOCS_DAILY_CAP_MICROS: cap } as never,
        calls as unknown as LlmCallDomain,
        pricing as unknown as LlmPricingService
    );
    return { service, calls, pricing };
}

describe('LlmPlatformBudgetService', () => {
    it('sem variável o teto é o equivalente a US$ 2 pela cotação do dia', async () => {
        const { service, pricing } = build(0, undefined);

        expect(await service.capMicros()).toBe(10_000_000);
        expect(pricing.usdToMicros).toHaveBeenCalledWith(2);
    });

    it('a variável vence o padrão', async () => {
        const { service, pricing } = build(0, 500);

        expect(await service.capMicros()).toBe(500);
        expect(pricing.usdToMicros).not.toHaveBeenCalled();
    });

    it('conta o gasto desde a meia-noite de Brasília e aceita quando a estimativa cabe', async () => {
        const { service, calls } = build(400, 500);

        await expect(service.assertRoom('market_docs', 100, NOW)).resolves.toBeUndefined();
        expect(calls.platformCostSince).toHaveBeenCalledWith('market_docs', new Date('2026-11-25T03:00:00Z'));
    });

    it('recusa quando a estimativa estoura o teto e diz quando volta', async () => {
        const { service } = build(450, 500);

        const failure: unknown = await service.assertRoom('market_docs', 100, NOW).catch((error: unknown): unknown => error);

        expect(failure).toBeInstanceOf(CapReachedError);
        expect((failure as CapReachedError).meta).toMatchObject({ resetsAt: '2026-11-26T03:00:00.000Z' });
    });
});
