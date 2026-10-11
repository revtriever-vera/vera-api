import { describe, expect, it, vi } from 'vitest';
import { PositionsRepository } from '../repositories/positions.repository';
import { PositionDomain } from './position.domain';

describe('PositionDomain', () => {
    it('delega ao repositório e traduz a remoção em booleano', async () => {
        const repository: Record<string, ReturnType<typeof vi.fn>> = {
            insertIfAbsent: vi.fn().mockResolvedValue(null),
            findById: vi.fn().mockResolvedValue({ id: 'p1' }),
            findByAsset: vi.fn().mockResolvedValue({ id: 'p1' }),
            listAll: vi.fn().mockResolvedValue([{ isSample: true }]),
            countAll: vi.fn().mockResolvedValue(3),
            patch: vi.fn().mockResolvedValue({ id: 'p1' }),
            softDelete: vi.fn().mockResolvedValueOnce({ id: 'p1' }).mockResolvedValueOnce(null),
            listReal: vi.fn().mockResolvedValue([{ id: 'r' }]),
            countReal: vi.fn().mockResolvedValue(1),
            softDeleteSamples: vi.fn().mockResolvedValue([{ id: 's' }]),
            listHeldAssetIdsAcrossTenants: vi.fn().mockResolvedValue(['a1'])
        };
        const domain: PositionDomain = new PositionDomain(repository as unknown as PositionsRepository);

        await expect(domain.createIfAbsent({ assetId: 'a1', quantity: '1', averagePrice: null })).resolves.toBeNull();
        await expect(domain.findById('p1')).resolves.toEqual({ id: 'p1' });
        await expect(domain.findByAsset('a1')).resolves.toEqual({ id: 'p1' });
        await expect(domain.listAll()).resolves.toEqual([{ isSample: true }]);
        await expect(domain.hasSamples()).resolves.toBe(true);
        await expect(domain.countAll()).resolves.toBe(3);
        await expect(domain.update('p1', { quantity: '2' })).resolves.toEqual({ id: 'p1' });
        await expect(domain.listReal()).resolves.toEqual([{ id: 'r' }]);
        await expect(domain.countReal()).resolves.toBe(1);
        await expect(domain.removeSamples()).resolves.toEqual([{ id: 's' }]);
        await expect(domain.remove('p1')).resolves.toBe(true);
        await expect(domain.remove('p1')).resolves.toBe(false);
        await expect(domain.listHeldAssetIdsAcrossTenants()).resolves.toEqual(['a1']);
    });
});
