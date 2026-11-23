import { Injectable } from '@nestjs/common';
import { HolderFilter } from '../../../shared/holder/holder-filter';
import { PositionsRepository } from '../repositories/positions.repository';
import { Position, PositionPatch } from './positions.types';

export interface NewPositionData {
    readonly assetId: string;
    readonly quantity: string;
    readonly averagePrice: string | null;
    readonly holderUserId: string | null;
    readonly isSample?: boolean;
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

    public async findByAssetAndHolder(assetId: string, holderUserId: string | null): Promise<Position | null> {
        return this.positions.findByAssetAndHolder(assetId, holderUserId);
    }

    public async listByHolder(filter: HolderFilter): Promise<Position[]> {
        return this.positions.listByHolder(filter);
    }

    public async clearHolder(userId: string): Promise<number> {
        return (await this.positions.clearHolder(userId)).length;
    }

    public async listAll(): Promise<Position[]> {
        return this.positions.listAll();
    }

    public async listReal(): Promise<Position[]> {
        return this.positions.listReal();
    }

    public async countReal(): Promise<number> {
        return this.positions.countReal();
    }

    public async hasSamples(): Promise<boolean> {
        return (await this.positions.listAll()).some((position: Position): boolean => position.isSample);
    }

    public async removeSamples(): Promise<Position[]> {
        return this.positions.softDeleteSamples();
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
