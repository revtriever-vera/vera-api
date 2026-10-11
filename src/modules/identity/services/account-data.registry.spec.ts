import { DiscoveryService } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { AccountErasureFailedError, AccountExportFailedError } from '../domain/identity.errors';
import { AccountDataEraserPort } from './account-data-eraser.port';
import { AccountDataExporterPort } from './account-data-exporter.port';
import { AccountDataRegistry } from './account-data.registry';
import { IdentityLogService } from './identity-log.service';

class FakeEraser extends AccountDataEraserPort {
    public readonly calls: string[] = [];

    public constructor(
        public readonly area: string,
        private readonly outcome: number | Error
    ) {
        super();
    }

    public eraseAll(companyId: string): Promise<number> {
        this.calls.push(companyId);
        return this.outcome instanceof Error ? Promise.reject(this.outcome) : Promise.resolve(this.outcome);
    }
}

class FakeExporter extends AccountDataExporterPort {
    public constructor(
        public readonly area: string,
        private readonly outcome: unknown
    ) {
        super();
    }

    public exportAll(): Promise<unknown> {
        return this.outcome instanceof Error ? Promise.reject(this.outcome) : Promise.resolve(this.outcome);
    }
}

function build(instances: unknown[]): { registry: AccountDataRegistry; logs: Record<string, ReturnType<typeof vi.fn>> } {
    const logs: Record<string, ReturnType<typeof vi.fn>> = { erasureAreaDone: vi.fn(), erasureAreaFailed: vi.fn() };
    const discovery: DiscoveryService = {
        getProviders: () => instances.map((instance: unknown) => ({ instance }))
    } as unknown as DiscoveryService;
    return { registry: new AccountDataRegistry(discovery, logs as unknown as IdentityLogService), logs };
}

describe('AccountDataRegistry', () => {
    it('acha apagadores e exportadores por instanceof e ignora os demais providers', async () => {
        const { registry } = build([new FakeEraser('assets', 1), new FakeExporter('assets', {}), {}, undefined, 'texto', null]);

        expect(registry.exportAreas()).toEqual(['assets']);
        await expect(registry.eraseAll('company-1')).resolves.toEqual([{ area: 'assets', erased: 1 }]);
    });

    it('funciona com zero portas registradas', async () => {
        const { registry } = build([{}]);

        expect(registry.exportAreas()).toEqual([]);
        await expect(registry.eraseAll('company-1')).resolves.toEqual([]);
        await expect(registry.exportSections('company-1')).resolves.toEqual({});
    });

    it('apaga na ordem de registro e loga cada área concluída', async () => {
        const first: FakeEraser = new FakeEraser('assets', 3);
        const second: FakeEraser = new FakeEraser('spending', 0);
        const { registry, logs } = build([first, second]);

        await expect(registry.eraseAll('company-1')).resolves.toEqual([
            { area: 'assets', erased: 3 },
            { area: 'spending', erased: 0 }
        ]);

        expect(first.calls).toEqual(['company-1']);
        expect(logs['erasureAreaDone']).toHaveBeenNthCalledWith(1, 'assets', 3);
        expect(logs['erasureAreaDone']).toHaveBeenNthCalledWith(2, 'spending', 0);
    });

    it('para na primeira falha, sem tocar nas áreas seguintes, e informa a área', async () => {
        const failure: Error = new Error('boom');
        const after: FakeEraser = new FakeEraser('spending', 1);
        const { registry, logs } = build([new FakeEraser('assets', failure), after]);

        const error: unknown = await registry.eraseAll('company-1').catch((caught: unknown) => caught);

        expect(error).toBeInstanceOf(AccountErasureFailedError);
        expect((error as AccountErasureFailedError).meta).toEqual({ area: 'assets' });
        expect((error as AccountErasureFailedError).cause).toBe(failure);
        expect(after.calls).toEqual([]);
        expect(logs['erasureAreaFailed']).toHaveBeenCalledWith('assets', failure);
    });

    it('junta as seções de cada exportador por área', async () => {
        const { registry } = build([new FakeExporter('assets', { items: [1] }), new FakeExporter('spending', [])]);

        await expect(registry.exportSections('company-1')).resolves.toEqual({ assets: { items: [1] }, spending: [] });
    });

    it('um exportador que lança derruba a exportação inteira', async () => {
        const { registry } = build([new FakeExporter('assets', {}), new FakeExporter('spending', new Error('boom'))]);

        const error: unknown = await registry.exportSections('company-1').catch((caught: unknown) => caught);

        expect(error).toBeInstanceOf(AccountExportFailedError);
        expect((error as AccountExportFailedError).meta).toEqual({ area: 'spending' });
    });
});
