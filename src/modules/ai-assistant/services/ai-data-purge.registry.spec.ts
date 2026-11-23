import { DiscoveryService } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { AiDataPurgePort } from './ai-data-purge.port';
import { AiDataPurgeRegistry } from './ai-data-purge.registry';

class FakePort extends AiDataPurgePort {
    public readonly area: string = 'fake';
    public readonly purge = vi.fn().mockResolvedValue(3);
}

function registry(instances: unknown[]): AiDataPurgeRegistry {
    const discovery = { getProviders: () => instances.map((instance: unknown) => ({ instance })) } as unknown as DiscoveryService;
    return new AiDataPurgeRegistry(discovery);
}

describe('AiDataPurgeRegistry', () => {
    it('soma o que cada porta registrada apagou e ignora os outros providers', async () => {
        const first: FakePort = new FakePort();
        const second: FakePort = new FakePort();

        const purged: number = await registry([first, {}, null, second]).purgeAll();

        expect(purged).toBe(6);
        expect(first.purge).toHaveBeenCalledOnce();
    });

    it('sem portas não apaga nada', async () => {
        expect(await registry([]).purgeAll()).toBe(0);
    });
});
