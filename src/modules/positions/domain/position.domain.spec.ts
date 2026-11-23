import { describe, expect, it, vi } from 'vitest';
import { PositionsRepository } from '../repositories/positions.repository';
import { PositionDomain } from './position.domain';

describe('PositionDomain', () => {
    it('delega ao repositório e traduz a remoção em booleano', async () => {
        const repository: Record<string, ReturnType<typeof vi.fn>> = {
            insertIfAbsent: vi.fn().mockResolvedValue(null),
            findById: vi.fn().mockResolvedValue({ id: 'p1' }),
            findByAssetAndHolder: vi.fn().mockResolvedValue({ id: 'p1' }),
            listByHolder: vi.fn().mockResolvedValue([{ id: 'h' }]),
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

        await expect(domain.createIfAbsent({ assetId: 'a1', quantity: '1', averagePrice: null, holderUserId: null })).resolves.toBeNull();
        await expect(domain.findById('p1')).resolves.toEqual({ id: 'p1' });
        await expect(domain.findByAssetAndHolder('a1', null)).resolves.toEqual({ id: 'p1' });
        await expect(domain.listByHolder({ kind: 'all' })).resolves.toEqual([{ id: 'h' }]);
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

    describe('releaseHolder', () => {
        function row(id: string, assetId: string, quantity: string, averagePrice: string | null): Record<string, unknown> {
            return { id, assetId, quantity, averagePrice };
        }

        it('moves a position to the whole account when it has no twin there', async () => {
            const repository = {
                listByHolder: vi.fn().mockResolvedValue([row('p1', 'a1', '1', null)]),
                findByAssetAndHolder: vi.fn().mockResolvedValue(null),
                patch: vi.fn().mockResolvedValue({}),
                softDelete: vi.fn()
            };
            const domain: PositionDomain = new PositionDomain(repository as unknown as PositionsRepository);

            await expect(domain.releaseHolder('ana')).resolves.toEqual([]);

            expect(repository.listByHolder).toHaveBeenCalledWith({ kind: 'person', userId: 'ana' });
            expect(repository.findByAssetAndHolder).toHaveBeenCalledWith('a1', null);
            expect(repository.patch).toHaveBeenCalledWith('p1', { holderUserId: null });
            expect(repository.softDelete).not.toHaveBeenCalled();
        });

        it('folds a position into the twin of the whole account: sums, weights the price and removes the person row', async () => {
            const repository = {
                listByHolder: vi.fn().mockResolvedValue([row('p1', 'a1', '30', '50')]),
                findByAssetAndHolder: vi.fn().mockResolvedValue(row('w1', 'a1', '10', '30')),
                patch: vi.fn().mockResolvedValue({}),
                softDelete: vi.fn().mockResolvedValue({})
            };
            const domain: PositionDomain = new PositionDomain(repository as unknown as PositionsRepository);

            const folded = await domain.releaseHolder('ana');

            expect(repository.patch).toHaveBeenCalledWith('w1', { quantity: '40', averagePrice: '45' });
            expect(repository.softDelete).toHaveBeenCalledWith('p1');
            expect(folded.map((position) => position.id)).toEqual(['p1']);
        });
    });
});
