import { Injectable } from '@nestjs/common';
import { AccountDataExporterPort } from '../../identity/services/account-data-exporter.port';
import { ClassAssignmentService } from '../../allocation/services/class-assignment.service';
import { Asset, AssetCatalogService } from '../../catalog/services/asset-catalog.service';
import { PositionDomain } from '../domain/position.domain';
import { normalizeDecimal } from '../domain/quantity';
import { POSITION_SUBJECT_TYPE, Position } from '../domain/positions.types';

export interface PositionExport {
    readonly symbol: string | null;
    readonly name: string | null;
    readonly quantity: string;
    readonly averagePrice: string | null;
    readonly classId: string | null;
    readonly createdAt: string;
}

@Injectable()
export class PositionsAccountExporter extends AccountDataExporterPort {
    public readonly area: string = 'positions';

    public constructor(
        private readonly positions: PositionDomain,
        private readonly catalog: AssetCatalogService,
        private readonly assignments: ClassAssignmentService
    ) {
        super();
    }

    public async exportAll(): Promise<PositionExport[]> {
        const positions: Position[] = await this.positions.listReal();
        const assets: Asset[] = await this.catalog.findManyByIds(positions.map((position: Position): string => position.assetId));
        const assetById: ReadonlyMap<string, Asset> = new Map(assets.map((asset: Asset): [string, Asset] => [asset.id, asset]));
        const classByPosition: ReadonlyMap<string, string> = new Map(
            (await this.assignments.listForCompany())
                .filter((assignment): boolean => assignment.subjectType === POSITION_SUBJECT_TYPE)
                .map((assignment): [string, string] => [assignment.subjectId, assignment.classId])
        );
        return positions.map((position: Position): PositionExport => ({
            symbol: assetById.get(position.assetId)?.symbol ?? null,
            name: assetById.get(position.assetId)?.name ?? null,
            quantity: normalizeDecimal(position.quantity),
            averagePrice: position.averagePrice === null ? null : normalizeDecimal(position.averagePrice),
            classId: classByPosition.get(position.id) ?? null,
            createdAt: position.createdAt.toISOString()
        }));
    }
}
