import { describe, expect, it, vi } from 'vitest';
import { ClassAssignmentService } from '../../allocation/services/class-assignment.service';
import { ClassResolverService } from '../../allocation/services/class-resolver.service';
import { AssetCatalogService } from '../../catalog/services/asset-catalog.service';
import { PositionDomain } from '../domain/position.domain';
import { PositionsSampleDataService } from './positions-sample-data.service';

type Mock = ReturnType<typeof vi.fn>;

function build(options: { real?: number; samples?: boolean; known?: string[]; classKey?: string | null; created?: boolean } = {}): {
    service: PositionsSampleDataService;
    createIfAbsent: Mock;
    assign: Mock;
    release: Mock;
} {
    const known: string[] = options.known ?? ['ITUB4', 'WEGE3', 'HGLG11', 'VOO'];
    const createIfAbsent: Mock = vi.fn().mockImplementation(() => Promise.resolve(options.created === false ? null : { id: 'p1' }));
    const assign: Mock = vi.fn().mockResolvedValue(undefined);
    const release: Mock = vi.fn().mockResolvedValue(undefined);
    const service: PositionsSampleDataService = new PositionsSampleDataService(
        {
            countReal: vi.fn().mockResolvedValue(options.real ?? 0),
            hasSamples: vi.fn().mockResolvedValue(options.samples ?? false),
            createIfAbsent,
            removeSamples: vi.fn().mockResolvedValue([{ id: 'p1' }, { id: 'p2' }])
        } as unknown as PositionDomain,
        {
            findByMarketAndExternalId: vi.fn().mockImplementation((_market: string, externalId: string) =>
                Promise.resolve(
                    known.includes(externalId)
                        ? {
                              id: `asset-${externalId}`,
                              suggestedClassKey: options.classKey === undefined ? 'acoes_br' : options.classKey
                          }
                        : null
                )
            )
        } as unknown as AssetCatalogService,
        { assign, release } as unknown as ClassAssignmentService,
        { resolveBySystemKey: vi.fn().mockResolvedValue({ id: 'class-1' }) } as unknown as ClassResolverService
    );
    return { service, createIfAbsent, assign, release };
}

describe('PositionsSampleDataService', () => {
    it('grava as posições de exemplo marcadas e atribui a classe de cada uma', async () => {
        const { service, createIfAbsent, assign } = build();

        await expect(service.seed()).resolves.toBe(4);

        expect(createIfAbsent).toHaveBeenCalledWith(expect.objectContaining({ isSample: true }));
        expect(assign).toHaveBeenCalledTimes(4);
    });

    it('não escreve nada quando já há dado real ou exemplo', async () => {
        for (const options of [{ real: 1 }, { samples: true }]) {
            const { service, createIfAbsent } = build(options);

            await expect(service.seed()).resolves.toBe(0);
            expect(createIfAbsent).not.toHaveBeenCalled();
        }
    });

    it('pula ativo fora do catálogo, sem classe sugerida ou já existente', async () => {
        await expect(build({ known: ['VOO'] }).service.seed()).resolves.toBe(1);
        await expect(build({ classKey: null }).service.seed()).resolves.toBe(0);
        await expect(build({ created: false }).service.seed()).resolves.toBe(0);
    });

    it('clear remove só exemplos e libera as atribuições', async () => {
        const { service, release } = build();

        await expect(service.clear()).resolves.toBe(2);
        expect(release.mock.calls).toEqual([
            ['position', 'p1'],
            ['position', 'p2']
        ]);
    });
});
