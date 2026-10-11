import { Injectable } from '@nestjs/common';
import { HeldAssetsPort } from '../services/held-assets.port';

@Injectable()
export class EmptyHeldAssetsDriver extends HeldAssetsPort {
    public listHeldAssetIdsAcrossTenants(): Promise<readonly string[]> {
        return Promise.resolve([]);
    }
}
