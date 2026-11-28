import { describe, expect, it, vi } from 'vitest';
import { FeatureState } from '../domain/plans.types';
import { FeatureStateService } from './feature-state.service';
import { PaidUsageReader } from './paid-usage-reader.service';
import { PlanGateService } from './plan-gate.service';
import { PlanResolverService } from './plan-resolver.service';
import { PlansLogService } from './plans-log.service';
import { PlansMetricsService } from './plans-metrics.service';

function gate(state: FeatureState, resetsAt: string | null = null, plan: string = 'premium'): PlanGateService {
    const states: FeatureStateService = { of: vi.fn().mockResolvedValue(state) } as unknown as FeatureStateService;
    const usage: PaidUsageReader = {
        state: vi.fn().mockResolvedValue(resetsAt === null ? null : { resetsAt })
    } as unknown as PaidUsageReader;
    const resolver: PlanResolverService = {
        planOf: vi.fn().mockResolvedValue(plan),
        mode: vi.fn().mockReturnValue('hosted')
    } as unknown as PlanResolverService;
    const logs: PlansLogService = { gateDenied: vi.fn() } as unknown as PlansLogService;
    const metrics: PlansMetricsService = { gate: vi.fn() } as unknown as PlansMetricsService;
    return new PlanGateService(states, resolver, usage, logs, metrics);
}

describe('PlanGateService', () => {
    it('deixa passar quando disponível', async () => {
        await expect(gate('available').assert('ai')).resolves.toBeUndefined();
        expect(await gate('available').allows('ai')).toBe(true);
    });

    it('lança billing.premium_required (402)', async () => {
        await expect(gate('premium_required').assert('ai')).rejects.toMatchObject({ code: 'billing.premium_required', status: 402 });
        expect(await gate('premium_required').allows('ai')).toBe(false);
    });

    it('lança billing.feature_disabled (503)', async () => {
        await expect(gate('disabled').assert('whatsapp')).rejects.toMatchObject({ code: 'billing.feature_disabled', status: 503 });
    });

    it('lança usage.cap_reached (429) com resetsAt e o plano da conta', async () => {
        await expect(gate('paused', '2026-12-01T03:00:00.000Z').assert('ai')).rejects.toMatchObject({
            code: 'usage.cap_reached',
            status: 429,
            meta: { feature: 'ai', resetsAt: '2026-12-01T03:00:00.000Z', plan: 'premium' }
        });
        await expect(gate('paused', null, 'free').assert('ai')).rejects.toMatchObject({ meta: { plan: 'free' } });
        await expect(gate('paused', null, 'self_hosted').assert('ai')).rejects.toMatchObject({ meta: { plan: null } });
    });

    it('expõe o plano e o modo do resolvedor', async () => {
        expect(await gate('available').planOf()).toBe('premium');
        expect(gate('available').mode()).toBe('hosted');
        expect(await gate('available').stateOf('calendar')).toBe('available');
    });
});
