import { describe, expect, it, vi } from 'vitest';
import { AssetsRepository } from '../repositories/assets.repository';
import { AssetDomain } from './asset.domain';
import { AssetWrite, StoredAssetState } from './catalog.types';

function write(externalId: string, sourceHash: string): AssetWrite {
    return { externalId, sourceHash } as AssetWrite;
}

function rig(states: StoredAssetState[]): {
    domain: AssetDomain;
    upsertAll: ReturnType<typeof vi.fn>;
    delistUnseen: ReturnType<typeof vi.fn>;
} {
    const upsertAll: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(undefined);
    const delistUnseen: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(3);
    const repository: unknown = {
        loadStates: vi.fn().mockResolvedValue(states),
        upsertAll,
        delistUnseen,
        findAssetById: vi.fn().mockResolvedValue({ id: 'a' }),
        findAssetsByIds: vi.fn().mockResolvedValue([{ id: 'a' }]),
        findAssetByMarketAndExternalId: vi.fn().mockResolvedValue(null),
        search: vi.fn().mockResolvedValue([]),
        countByStatus: vi.fn().mockResolvedValue([{ status: 'active', total: 1 }])
    };
    return { domain: new AssetDomain(repository as AssetsRepository), upsertAll, delistUnseen };
}

describe('AssetDomain.applySnapshot', () => {
    const seenAt: Date = new Date('2026-10-10T09:00:00Z');

    it('counts new, changed and reactivated assets as upserted and ignores identical ones', async () => {
        const { domain, upsertAll, delistUnseen } = rig([
            { externalId: 'SAME', sourceHash: 'h1', status: 'active' },
            { externalId: 'CHANGED', sourceHash: 'old', status: 'active' },
            { externalId: 'BACK', sourceHash: 'h3', status: 'delisted' }
        ]);

        const result = await domain.applySnapshot(
            'B3',
            [write('SAME', 'h1'), write('CHANGED', 'new'), write('BACK', 'h3'), write('NEW', 'h4')],
            seenAt
        );

        expect(result).toEqual({ upserted: 3, delisted: 3 });
        expect(upsertAll).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ externalId: 'SAME' })]), seenAt);
        expect(delistUnseen).toHaveBeenCalledWith('B3', seenAt);
    });

    it('reports nothing upserted when every asset is unchanged', async () => {
        const { domain } = rig([{ externalId: 'SAME', sourceHash: 'h1', status: 'active' }]);

        expect((await domain.applySnapshot('B3', [write('SAME', 'h1')], seenAt)).upserted).toBe(0);
    });

    it('delegates lookups to the repository', async () => {
        const { domain } = rig([]);

        expect(await domain.findById('a')).toEqual({ id: 'a' });
        expect(await domain.findManyByIds(['a'])).toEqual([{ id: 'a' }]);
        expect(await domain.findByMarketAndExternalId('B3', 'X')).toBeNull();
        expect(await domain.search({ text: '', likeText: '', limit: 1 })).toEqual([]);
        expect(await domain.countByStatus('B3')).toEqual([{ status: 'active', total: 1 }]);
    });
});
