import { Injectable } from '@nestjs/common';
import { PositionDomain } from '../domain/position.domain';

@Injectable()
export class HeldAssetsService {
    public constructor(private readonly positions: PositionDomain) {}

    public async listHeldAssetIdsAcrossTenants(): Promise<readonly string[]> {
        return this.positions.listHeldAssetIdsAcrossTenants();
    }
}
