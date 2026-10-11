import { Injectable } from '@nestjs/common';
import { PositionDomain } from '../domain/position.domain';
import { Position } from '../domain/positions.types';

@Injectable()
export class PositionReaderService {
    public constructor(private readonly positions: PositionDomain) {}

    public async listForCompany(): Promise<readonly Position[]> {
        return this.positions.listAll();
    }
}
