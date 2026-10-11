import { describe, expect, it, vi } from 'vitest';
import { PositionDomain } from '../domain/position.domain';
import { HeldAssetsPort } from '../../market-data/services/held-assets.port';
import { HeldAssetsService } from './held-assets.service';

describe('HeldAssetsService', () => {
    it('devolve os ids de ativo em carteira sem repetição, vindos do domain', async () => {
        const listHeldAssetIdsAcrossTenants: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(['a1', 'a2']);
        const service: HeldAssetsService = new HeldAssetsService({ listHeldAssetIdsAcrossTenants } as unknown as PositionDomain);

        await expect(service.listHeldAssetIdsAcrossTenants()).resolves.toEqual(['a1', 'a2']);
    });

    it('é a implementação da porta de ativos em carteira do market-data', () => {
        expect(new HeldAssetsService({} as unknown as PositionDomain)).toBeInstanceOf(HeldAssetsPort);
    });
});
