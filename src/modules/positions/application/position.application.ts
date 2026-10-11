import { Injectable } from '@nestjs/common';
import { UsingTransaction } from '../../../core/database/using-transaction.decorator';
import { ClassAssignmentService } from '../../allocation/services/class-assignment.service';
import { ClassResolverService } from '../../allocation/services/class-resolver.service';
import { Asset, AssetCatalogService } from '../../catalog/services/asset-catalog.service';
import { PositionDomain } from '../domain/position.domain';
import { toPositionView } from '../domain/position.mapper';
import {
    AssetAlreadyInPortfolioError,
    AssetNotAvailableError,
    ClassRequiredError,
    InvalidQuantityError,
    PositionLimitReachedError,
    PositionNotFoundError
} from '../domain/positions.errors';
import {
    ACTIVE_ASSET_STATUS,
    CreatePositionInput,
    MAX_POSITIONS_PER_COMPANY,
    POSITION_ACTIONS,
    POSITION_SUBJECT_TYPE,
    Position,
    PositionAction,
    PositionPatch,
    PositionView,
    UpdatePositionInput
} from '../domain/positions.types';
import { fitsDecimals } from '../domain/quantity';
import { PositionsLogService } from '../services/positions-log.service';
import { PositionsMetricsService } from '../services/positions-metrics.service';

@Injectable()
export class PositionApplication {
    public constructor(
        private readonly positions: PositionDomain,
        private readonly catalog: AssetCatalogService,
        private readonly assignments: ClassAssignmentService,
        private readonly resolver: ClassResolverService,
        private readonly logs: PositionsLogService,
        private readonly metrics: PositionsMetricsService
    ) {}

    @UsingTransaction()
    public async create(input: CreatePositionInput): Promise<PositionView> {
        const asset: Asset = await this.catalog.requireById(input.assetId);
        if (asset.status !== ACTIVE_ASSET_STATUS) {
            throw new AssetNotAvailableError(asset.id);
        }
        this.assertQuantity(input.quantity, asset);
        const classId: string = await this.classIdFor(asset, input.classId);
        if ((await this.positions.countAll()) >= MAX_POSITIONS_PER_COMPANY) {
            throw new PositionLimitReachedError(MAX_POSITIONS_PER_COMPANY);
        }
        const created: Position | null = await this.positions.createIfAbsent({
            assetId: asset.id,
            quantity: input.quantity,
            averagePrice: input.averagePrice ?? null
        });
        if (created === null) {
            throw await this.duplicateOf(asset.id);
        }
        await this.assignments.assign(POSITION_SUBJECT_TYPE, created.id, classId);
        this.recordWrite(POSITION_ACTIONS.created, created);
        return toPositionView(created, classId);
    }

    public async get(id: string): Promise<PositionView> {
        const position: Position = await this.require(id);
        return toPositionView(position, await this.assignments.requireClassId(POSITION_SUBJECT_TYPE, position.id));
    }

    public async update(id: string, input: UpdatePositionInput): Promise<PositionView> {
        const current: Position = await this.require(id);
        if (input.quantity !== undefined) {
            this.assertQuantity(input.quantity, await this.catalog.requireById(current.assetId));
        }
        const patch: PositionPatch = { quantity: input.quantity, averagePrice: input.averagePrice };
        const updated: Position = (await this.positions.update(id, patch)) ?? (await this.require(id));
        this.recordWrite(POSITION_ACTIONS.updated, updated);
        return toPositionView(updated, await this.assignments.requireClassId(POSITION_SUBJECT_TYPE, updated.id));
    }

    @UsingTransaction()
    public async remove(id: string): Promise<void> {
        const position: Position = await this.require(id);
        await this.positions.remove(position.id);
        await this.assignments.release(POSITION_SUBJECT_TYPE, position.id);
        this.recordWrite(POSITION_ACTIONS.removed, position);
    }

    private async require(id: string): Promise<Position> {
        const position: Position | null = await this.positions.findById(id);
        if (position === null) {
            throw new PositionNotFoundError(id);
        }
        return position;
    }

    private assertQuantity(quantity: string, asset: Asset): void {
        if (!fitsDecimals(quantity, asset.quantityDecimals)) {
            throw new InvalidQuantityError(asset.quantityDecimals);
        }
    }

    private async classIdFor(asset: Asset, requested: string | undefined): Promise<string> {
        if (requested !== undefined) {
            return requested;
        }
        if (asset.suggestedClassKey === null) {
            throw new ClassRequiredError(asset.id);
        }
        return (await this.resolver.resolveBySystemKey(asset.suggestedClassKey)).id;
    }

    private async duplicateOf(assetId: string): Promise<AssetAlreadyInPortfolioError> {
        const existing: Position | null = await this.positions.findByAsset(assetId);
        if (existing === null) {
            throw new Error(`Positions conflict without a live row for asset "${assetId}"`);
        }
        this.logs.duplicate(assetId, existing.id);
        return new AssetAlreadyInPortfolioError(existing.id);
    }

    private recordWrite(action: PositionAction, position: Position): void {
        this.logs.written(action, position.id, position.assetId);
        this.metrics.action(action);
    }
}
