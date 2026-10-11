import { Injectable } from '@nestjs/common';
import { HeldAssetsPort } from '../../market-data/services/held-assets.port';
import { PositionDomain } from '../domain/position.domain';

@Injectable()
export class HeldAssetsService extends HeldAssetsPort {
    public constructor(private readonly positions: PositionDomain) {
        super();
    }

    public async listHeldAssetIdsAcrossTenants(): Promise<readonly string[]> {
        return this.positions.listHeldAssetIdsAcrossTenants();
    }
}
