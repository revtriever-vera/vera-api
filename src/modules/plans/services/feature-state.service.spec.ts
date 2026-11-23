import { describe, expect, it, vi } from 'vitest';
import { PaidUsageSnapshot, PaidFeature } from '../domain/plans.types';
import { FeatureStateService } from './feature-state.service';
import { PaidFeatureAvailabilityRegistry } from './paid-feature-availability.registry';
import { PaidUsageReader } from './paid-usage-reader.service';
import { PlanResolverService } from './plan-resolver.service';

function service(enabled: boolean, capabilities: PaidFeature[], usageState: 'ok' | 'paused' | null): FeatureStateService {
    const availability: PaidFeatureAvailabilityRegistry = {
        enabled: vi.fn().mockResolvedValue(enabled)
    } as unknown as PaidFeatureAvailabilityRegistry;
    const resolver: PlanResolverService = { capabilities: vi.fn().mockResolvedValue(capabilities) } as unknown as PlanResolverService;
    const snapshot: PaidUsageSnapshot | null =
        usageState === null
            ? null
            : { usedBps: 0, state: usageState, resetsAt: 'x', byFeature: { ai: { usedBps: 0 }, whatsapp: { usedBps: 0 } } };
    const usage: PaidUsageReader = { state: vi.fn().mockResolvedValue(snapshot) } as unknown as PaidUsageReader;
    return new FeatureStateService(availability, resolver, usage);
}

describe('FeatureStateService', () => {
    it('sem chave é disabled, mesmo com premium', async () => {
        expect(await service(false, ['ai'], 'ok').of('ai')).toBe('disabled');
    });

    it('sem a capacidade é premium_required', async () => {
        expect(await service(true, [], 'ok').of('ai')).toBe('premium_required');
    });

    it('cota pausada é paused e sem medidor é available', async () => {
        expect(await service(true, ['ai'], 'paused').of('ai')).toBe('paused');
        expect(await service(true, ['ai'], null).of('ai')).toBe('available');
    });
});
