import { DiscoveryService } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { OnboardingSampleLogService } from './onboarding-sample-log.service';
import { SampleDataPort } from './sample-data.port';
import { SampleDataRegistry } from './sample-data.registry';

class FakePort extends SampleDataPort {
    public readonly calls: string[] = [];

    public constructor(
        public readonly area: string,
        private readonly outcome: number | Error
    ) {
        super();
    }

    public seed(companyId: string): Promise<number> {
        this.calls.push(`seed:${companyId}`);
        return this.run();
    }

    public clear(companyId: string): Promise<number> {
        this.calls.push(`clear:${companyId}`);
        return this.run();
    }

    private run(): Promise<number> {
        if (this.outcome instanceof Error) {
            return Promise.reject(this.outcome);
        }
        return Promise.resolve(this.outcome);
    }
}

function registryOver(instances: readonly unknown[]): { registry: SampleDataRegistry; areaFailed: ReturnType<typeof vi.fn> } {
    const discovery: DiscoveryService = {
        getProviders: () => instances.map((instance: unknown) => ({ instance }))
    } as unknown as DiscoveryService;
    const areaFailed: ReturnType<typeof vi.fn> = vi.fn();
    const log: OnboardingSampleLogService = { areaFailed } as unknown as OnboardingSampleLogService;
    return { registry: new SampleDataRegistry(discovery, log), areaFailed };
}

describe('SampleDataRegistry', () => {
    it('sem nenhuma porta não está disponível e semear e limpar devolvem vazio', async () => {
        const { registry } = registryOver([{ area: 'assets' }, 'text', null, undefined]);

        expect(registry.available()).toBe(false);
        await expect(registry.seedAll('company-1')).resolves.toEqual([]);
        await expect(registry.clearAll('company-1')).resolves.toEqual([]);
    });

    it('descobre por instanceof, repassa o companyId e executa em ordem estável por área', async () => {
        const spending: FakePort = new FakePort('spending', 4);
        const assets: FakePort = new FakePort('assets', 6);
        const { registry } = registryOver([spending, 'alheio', assets]);

        expect(registry.available()).toBe(true);
        await expect(registry.seedAll('company-1')).resolves.toEqual([
            { area: 'assets', count: 6 },
            { area: 'spending', count: 4 }
        ]);
        await expect(registry.clearAll('company-1')).resolves.toEqual([
            { area: 'assets', count: 6 },
            { area: 'spending', count: 4 }
        ]);
        expect(assets.calls).toEqual(['seed:company-1', 'clear:company-1']);
    });

    it('para na primeira falha, registra a área e lança onboarding.sample_failed', async () => {
        const boom: Error = new Error('boom');
        const first: FakePort = new FakePort('assets', 2);
        const second: FakePort = new FakePort('banks', boom);
        const third: FakePort = new FakePort('target', 1);
        const { registry, areaFailed } = registryOver([first, second, third]);

        await expect(registry.seedAll('company-1')).rejects.toMatchObject({
            code: 'onboarding.sample_failed',
            status: 500,
            meta: { area: 'banks' }
        });
        expect(areaFailed).toHaveBeenCalledWith('banks', boom);
        expect(third.calls).toEqual([]);
    });
});
