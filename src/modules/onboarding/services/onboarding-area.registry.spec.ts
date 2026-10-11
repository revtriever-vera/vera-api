import { DiscoveryService } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { OnboardingArea, OnboardingAreaSummary, OnboardingAreaSummaryPort } from './onboarding-area-summary.port';
import { OnboardingAreaRegistry } from './onboarding-area.registry';
import { OnboardingLogService } from './onboarding-log.service';

class FakePort extends OnboardingAreaSummaryPort {
    public constructor(
        public readonly area: OnboardingArea,
        private readonly outcome: OnboardingAreaSummary | Error
    ) {
        super();
    }

    public summarize(): Promise<OnboardingAreaSummary> {
        if (this.outcome instanceof Error) {
            return Promise.reject(this.outcome);
        }
        return Promise.resolve(this.outcome);
    }
}

function summary(items: number): OnboardingAreaSummary {
    return { items, amountCents: null, currency: null };
}

function registryOver(instances: readonly unknown[]): { registry: OnboardingAreaRegistry; failed: ReturnType<typeof vi.fn> } {
    const discovery: DiscoveryService = {
        getProviders: () => instances.map((instance: unknown) => ({ instance }))
    } as unknown as DiscoveryService;
    const failed: ReturnType<typeof vi.fn> = vi.fn();
    const log: OnboardingLogService = { summaryAreaFailed: failed } as unknown as OnboardingLogService;
    return { registry: new OnboardingAreaRegistry(discovery, log), failed };
}

describe('OnboardingAreaRegistry', () => {
    it('sem nenhuma porta registrada devolve tudo null', async () => {
        const { registry } = registryOver([]);

        await expect(registry.summarize('company-1')).resolves.toEqual({ assets: null, banks: null, target: null });
    });

    it('com uma porta preenche só a área dela', async () => {
        const { registry } = registryOver([new FakePort('assets', summary(12))]);

        await expect(registry.summarize('company-1')).resolves.toEqual({ assets: summary(12), banks: null, target: null });
    });

    it('com três portas preenche as três áreas e repassa o companyId', async () => {
        const assets: FakePort = new FakePort('assets', summary(1));
        const spy = vi.spyOn(assets, 'summarize');
        const { registry } = registryOver([assets, new FakePort('banks', summary(2)), new FakePort('target', summary(3))]);

        await expect(registry.summarize('company-1')).resolves.toEqual({ assets: summary(1), banks: summary(2), target: summary(3) });
        expect(spy).toHaveBeenCalledWith('company-1');
    });

    it('porta que lança vira null com aviso e não derruba as outras', async () => {
        const boom: Error = new Error('boom');
        const { registry, failed } = registryOver([new FakePort('assets', boom), new FakePort('banks', summary(2))]);

        await expect(registry.summarize('company-1')).resolves.toEqual({ assets: null, banks: summary(2), target: null });
        expect(failed).toHaveBeenCalledWith('assets', boom);
    });

    it('ignora providers alheios, inclusive os sem instância', async () => {
        const { registry } = registryOver([{ area: 'assets' }, 'text', null, undefined, new FakePort('banks', summary(2))]);

        await expect(registry.summarize('company-1')).resolves.toEqual({ assets: null, banks: summary(2), target: null });
    });
});
