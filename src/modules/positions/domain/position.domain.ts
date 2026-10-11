import { Injectable } from '@nestjs/common';
import { PositionsRepository } from '../repositories/positions.repository';
import { Position, PositionPatch } from './positions.types';

export interface NewPositionData {
    readonly assetId: string;
    readonly quantity: string;
    readonly averagePrice: string | null;
}

@Injectable()
export class PositionDomain {
    public constructor(private readonly positions: PositionsRepository) {}

    public async createIfAbsent(data: NewPositionData): Promise<Position | null> {
        return this.positions.insertIfAbsent(data);
    }

    public async findById(id: string): Promise<Position | null> {
        return this.positions.findById(id);
    }

    public async findByAsset(assetId: string): Promise<Position | null> {
        return this.positions.findByAsset(assetId);
    }

    public async listAll(): Promise<Position[]> {
        return this.positions.listAll();
    }

    public async countAll(): Promise<number> {
        return this.positions.countAll();
    }

    public async update(id: string, patch: PositionPatch): Promise<Position | null> {
        return this.positions.patch(id, patch);
    }

    public async remove(id: string): Promise<boolean> {
        return (await this.positions.softDelete(id)) !== null;
    }

    public async listHeldAssetIdsAcrossTenants(): Promise<string[]> {
        return this.positions.listHeldAssetIdsAcrossTenants();
    }
}
