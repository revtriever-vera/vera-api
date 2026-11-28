import { describe, expect, it, vi } from 'vitest';
import { PlanCatalogDomain } from '../domain/plan-catalog.domain';
import { PlanLimitDomain } from '../domain/plan-limit.domain';
import { CompanyProductLimit, EffectivePlan, GlobalProductLimit } from '../domain/plans.types';
import { PlanLimitService } from './plan-limit.service';
import { PlanResolverService } from './plan-resolver.service';

const CONFIGURED_MICROS: number = 4_000_000;
const SINCE: Date = new Date('2020-01-01');

interface BuildInput {
    readonly mode?: 'hosted' | 'self_hosted';
    readonly plan?: EffectivePlan;
    readonly own?: readonly Partial<CompanyProductLimit>[];
    readonly catalog?: readonly Partial<GlobalProductLimit>[];
}

function build(input: BuildInput = {}): { service: PlanLimitService; limitsOf: ReturnType<typeof vi.fn> } {
    const limitsOf = vi.fn().mockResolvedValue(input.catalog ?? []);
    const catalog = { productOf: vi.fn().mockResolvedValue({ id: 'product' }), limitsOf } as unknown as PlanCatalogDomain;
    const limits = { companyLimits: vi.fn().mockResolvedValue(input.own ?? []) } as unknown as PlanLimitDomain;
    const resolver = { planOf: vi.fn().mockResolvedValue(input.plan ?? 'free') } as unknown as PlanResolverService;
    const service: PlanLimitService = new PlanLimitService({ DEPLOYMENT_MODE: input.mode ?? 'hosted' }, catalog, limits, resolver);
    return { service, limitsOf };
}

describe('teto da cota de uso pago', () => {
    it('na hospedada, o teto vem do catálogo do plano da conta', async () => {
        const free = build({ plan: 'free', catalog: [{ quantity: '5000000', startsAt: SINCE, endsAt: null }] });
        const premium = build({ plan: 'premium', catalog: [{ quantity: '10000000', startsAt: SINCE, endsAt: null }] });

        expect(await free.service.capMicros(CONFIGURED_MICROS)).toBe(5_000_000);
        expect(free.limitsOf).toHaveBeenCalledWith('free', 'product', 'cost_micros');
        expect(await premium.service.capMicros(CONFIGURED_MICROS)).toBe(10_000_000);
        expect(premium.limitsOf).toHaveBeenCalledWith('premium', 'product', 'cost_micros');
    });

    it('na hospedada, o teto próprio da company vale mais que o do plano', async () => {
        const own: Partial<CompanyProductLimit> = { quantity: '9000000', startsAt: SINCE, endsAt: null };
        const { service } = build({ own: [own], catalog: [{ quantity: '5000000', startsAt: SINCE, endsAt: null }] });

        expect(await service.capMicros(CONFIGURED_MICROS)).toBe(9_000_000);
    });

    it('sem linha do plano em vigor, vale o configurado em PAID_USAGE_CAP_MICROS', async () => {
        const ended: Partial<GlobalProductLimit> = { quantity: '5000000', startsAt: SINCE, endsAt: new Date('2021-01-01') };

        expect(await build({ catalog: [ended] }).service.capMicros(CONFIGURED_MICROS)).toBe(CONFIGURED_MICROS);
        expect(await build().service.capMicros(null)).toBeNull();
    });

    it('na auto-hospedada não há cota, qualquer que seja o configurado', async () => {
        expect(await build({ mode: 'self_hosted' }).service.capMicros(CONFIGURED_MICROS)).toBeNull();
    });

    it('plano auto-hospedado num ambiente hospedado não lê o catálogo', async () => {
        const { service, limitsOf } = build({ plan: 'self_hosted' });

        expect(await service.capMicros(CONFIGURED_MICROS)).toBe(CONFIGURED_MICROS);
        expect(limitsOf).not.toHaveBeenCalled();
    });
});
