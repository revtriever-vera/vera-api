import { Injectable } from '@nestjs/common';
import { HolderFilter } from '../../../shared/holder/holder-filter';
import { PositionDomain } from '../domain/position.domain';
import { Position } from '../domain/positions.types';

export type { Position };

@Injectable()
export class PositionReaderService {
    public constructor(private readonly positions: PositionDomain) {}

    public async listForCompany(filter: HolderFilter): Promise<readonly Position[]> {
        return this.positions.listByHolder(filter);
    }
}
