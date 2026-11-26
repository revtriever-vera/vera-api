import { Injectable } from '@nestjs/common';
import { HolderFilter } from '../../../shared/holder/holder-filter';
import { mergedPositionPatch } from './position-merge';
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

    public async releaseHolder(userId: string): Promise<Position[]> {
        const folded: Position[] = [];
        for (const position of await this.positions.listByHolder({ kind: 'person', userId })) {
            if (await this.moveToWholeAccount(position)) {
                folded.push(position);
            }
        }
        return folded;
    }

    private async moveToWholeAccount(position: Position): Promise<boolean> {
        const whole: Position | null = await this.positions.findByAssetAndHolder(position.assetId, null);
        if (whole === null) {
            await this.positions.patch(position.id, { holderUserId: null });
            return false;
        }
        await this.positions.patch(whole.id, mergedPositionPatch(whole, position));
        await this.positions.softDelete(position.id);
        return true;
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

    public async listCompanyIdsWithRealAcrossTenants(): Promise<string[]> {
        return this.positions.listCompanyIdsWithRealAcrossTenants();
    }
}
