import { Injectable } from '@nestjs/common';
import { UsingTransaction } from '../../../core/database/using-transaction.decorator';
import { DateUtil } from '../../../shared/utils/date.util';
import { ClassAssignmentService } from '../../allocation/services/class-assignment.service';
import { ClassResolverService } from '../../allocation/services/class-resolver.service';
import { MemberDirectoryService } from '../../identity/services/member-directory.service';
import { Asset, AssetCatalogService } from '../../catalog/services/asset-catalog.service';
import { applyOperations, AverageCostResult, sortOperations } from '../domain/average-cost';
import { InvestmentImportDomain } from '../domain/investment-import.domain';
import { InvestmentOperationDomain } from '../domain/investment-operation.domain';
import {
    ApplyResult,
    BalanceState,
    InvestmentImport,
    InvestmentOperation,
    IMPORT_STATUSES,
    OPERATION_KINDS,
    NewImportInput,
    OperationInput,
    PositionEffect,
    PositionSnapshotEntry
} from '../domain/investment-operations.types';
import { operationFingerprint } from '../domain/operation-fingerprint';
import { operationRowOf } from '../domain/operation-row';
import { PositionDomain } from '../domain/position.domain';
import {
    AssetNotAvailableError,
    ClassRequiredError,
    ImportNotFoundError,
    ImportNotOpenError,
    InvalidQuantityError,
    PositionChangedSinceImportError,
    PositionLimitReachedError,
    SellExceedsPositionError,
    UndoBlockedByLaterImportError
} from '../domain/positions.errors';
import { ACTIVE_ASSET_STATUS, MAX_POSITIONS_PER_COMPANY, POSITION_SUBJECT_TYPE, Position } from '../domain/positions.types';
import { fitsDecimals, normalizeDecimal } from '../domain/quantity';
import { positionSnapshotsSchema } from '../validation/position-snapshots.schema';
import { assertValidOperations } from './operation-validation';

interface PlannedAsset {
    readonly effect: PositionEffect;
    readonly position: Position | null;
}

@Injectable()
export class PositionOperationsService {
    public constructor(
        private readonly positions: PositionDomain,
        private readonly imports: InvestmentImportDomain,
        private readonly operations: InvestmentOperationDomain,
        private readonly catalog: AssetCatalogService,
        private readonly assignments: ClassAssignmentService,
        private readonly resolver: ClassResolverService,
        private readonly members: MemberDirectoryService
    ) {}

    public async createImport(input: NewImportInput): Promise<InvestmentImport> {
        return this.imports.create(input);
    }

    public async preview(holderUserId: string | null, operations: readonly OperationInput[]): Promise<PositionEffect[]> {
        await this.assertHolder(holderUserId);
        const planned: PlannedAsset[] = await this.plan(holderUserId, operations);
        return planned.map((item: PlannedAsset): PositionEffect => item.effect);
    }

    @UsingTransaction()
    public async apply(importId: string, holderUserId: string | null, operations: readonly OperationInput[]): Promise<ApplyResult> {
        await this.requireOpenImport(importId);
        await this.assertHolder(holderUserId);
        const fresh: OperationInput[] = await this.withoutDuplicates(holderUserId, operations);
        const planned: PlannedAsset[] = await this.plan(holderUserId, fresh);
        await this.assertRoom(planned);
        const before: PositionSnapshotEntry[] = await this.snapshotsOf(holderUserId, planned);
        await this.store(importId, holderUserId, fresh);
        const after: PositionSnapshotEntry[] = await this.write(holderUserId, planned);
        await this.imports.saveSnapshots(importId, before, after);
        return {
            applied: fresh.length,
            skippedDuplicates: operations.length - fresh.length,
            effects: planned.map((item: PlannedAsset): PositionEffect => item.effect)
        };
    }

    @UsingTransaction()
    public async undo(importId: string): Promise<void> {
        const current: InvestmentImport = await this.requireImport(importId);
        if (current.status !== IMPORT_STATUSES.completed) {
            throw new ImportNotOpenError(importId);
        }
        const stored: InvestmentOperation[] = await this.operations.listByImport(importId);
        await this.assertNoLaterImport(importId, stored);
        const before: PositionSnapshotEntry[] = positionSnapshotsSchema.parse(current.positionsBefore);
        const after: PositionSnapshotEntry[] = positionSnapshotsSchema.parse(current.positionsAfter);
        for (const [index, entry] of after.entries()) {
            await this.restore(entry, before[index] ?? null);
        }
        await this.operations.softDeleteByImport(importId);
        await this.imports.markUndone(importId);
    }

    private async assertHolder(holderUserId: string | null): Promise<void> {
        if (holderUserId !== null) {
            await this.members.requireActive(holderUserId);
        }
    }

    private async requireImport(importId: string): Promise<InvestmentImport> {
        const found: InvestmentImport | null = await this.imports.findById(importId);
        if (found === null) {
            throw new ImportNotFoundError(importId);
        }
        return found;
    }

    private async requireOpenImport(importId: string): Promise<void> {
        const found: InvestmentImport = await this.requireImport(importId);
        const stored: InvestmentOperation[] = await this.operations.listByImport(importId);
        if (found.status !== IMPORT_STATUSES.completed || stored.length > 0) {
            throw new ImportNotOpenError(importId);
        }
    }

    private async withoutDuplicates(holderUserId: string | null, operations: readonly OperationInput[]): Promise<OperationInput[]> {
        assertValidOperations(operations);
        const known: ReadonlySet<string> = await this.operations.existingFingerprints(
            operations.map((operation: OperationInput): string => operationFingerprint(holderUserId, operation))
        );
        const seen: Set<string> = new Set(known);
        return operations.filter((operation: OperationInput): boolean => {
            const fingerprint: string = operationFingerprint(holderUserId, operation);
            const isNew: boolean = !seen.has(fingerprint);
            seen.add(fingerprint);
            return isNew;
        });
    }

    private async plan(holderUserId: string | null, operations: readonly OperationInput[]): Promise<PlannedAsset[]> {
        assertValidOperations(operations);
        const byAsset: Map<string, OperationInput[]> = groupByAsset(operations);
        const assets: Map<string, Asset> = await this.assetsOf([...byAsset.keys()]);
        const planned: PlannedAsset[] = [];
        for (const [assetId, group] of byAsset) {
            planned.push(await this.planAsset(holderUserId, assets.get(assetId) ?? null, assetId, group));
        }
        return planned;
    }

    private async assetsOf(assetIds: readonly string[]): Promise<Map<string, Asset>> {
        const assets: Asset[] = await this.catalog.findManyByIds(assetIds);
        return new Map(assets.map((asset: Asset): [string, Asset] => [asset.id, asset]));
    }

    private async planAsset(
        holderUserId: string | null,
        asset: Asset | null,
        assetId: string,
        group: readonly OperationInput[]
    ): Promise<PlannedAsset> {
        if (asset === null) {
            throw new AssetNotAvailableError(assetId);
        }
        const position: Position | null = await this.positions.findByAssetAndHolder(assetId, holderUserId);
        const before: BalanceState | null = position === null ? null : balanceOfPosition(position);
        assertQuantities(asset, group);
        const result: AverageCostResult = applyOperations(before, group);
        if (!result.ok) {
            throw new SellExceedsPositionError(assetId, result.error.operation.lineNumber, result.error.operation.tradeDate);
        }
        if (position === null && result.balance !== null && asset.status !== ACTIVE_ASSET_STATUS) {
            throw new AssetNotAvailableError(assetId);
        }
        return { effect: { assetId, before, after: result.balance }, position };
    }

    private async assertRoom(planned: readonly PlannedAsset[]): Promise<void> {
        const created: number = planned.filter(
            (item: PlannedAsset): boolean => item.position === null && item.effect.after !== null
        ).length;
        if (created > 0 && (await this.positions.countAll()) + created > MAX_POSITIONS_PER_COMPANY) {
            throw new PositionLimitReachedError(MAX_POSITIONS_PER_COMPANY);
        }
    }

    private async store(importId: string, holderUserId: string | null, operations: readonly OperationInput[]): Promise<void> {
        const sorted: OperationInput[] = sortOperations(operations);
        await this.operations.insertMany(sorted.map((operation: OperationInput) => operationRowOf(importId, holderUserId, operation)));
    }

    private async snapshotsOf(holderUserId: string | null, planned: readonly PlannedAsset[]): Promise<PositionSnapshotEntry[]> {
        const entries: PositionSnapshotEntry[] = [];
        for (const item of planned) {
            const state: PositionSnapshotEntry['state'] = item.position === null ? null : await this.snapshotOf(item.position);
            entries.push({ assetId: item.effect.assetId, holderUserId, state });
        }
        return entries;
    }

    private async snapshotOf(position: Position): Promise<NonNullable<PositionSnapshotEntry['state']>> {
        return {
            ...balanceOfPosition(position),
            classId: await this.assignments.requireClassId(POSITION_SUBJECT_TYPE, position.id)
        };
    }

    private async write(holderUserId: string | null, planned: readonly PlannedAsset[]): Promise<PositionSnapshotEntry[]> {
        const entries: PositionSnapshotEntry[] = [];
        for (const item of planned) {
            entries.push(await this.writeAsset(holderUserId, item));
        }
        return entries;
    }

    private async writeAsset(holderUserId: string | null, item: PlannedAsset): Promise<PositionSnapshotEntry> {
        const { assetId, before, after } = item.effect;
        if (item.position !== null && sameBalance(before, after)) {
            return { assetId, holderUserId, state: before === null ? null : { ...before, classId: await this.classOf(item.position) } };
        }
        const classId: string = item.position === null ? await this.suggestedClassOf(assetId) : await this.classOf(item.position);
        if (item.position === null) {
            const created: PositionSnapshotEntry['state'] =
                after === null ? null : await this.create(assetId, holderUserId, after, classId);
            return { assetId, holderUserId, state: created };
        }
        if (after === null) {
            await this.removePosition(item.position);
            return { assetId, holderUserId, state: null };
        }
        await this.positions.update(item.position.id, { quantity: after.quantity, averagePrice: after.averagePrice });
        return { assetId, holderUserId, state: { ...after, classId } };
    }

    private async suggestedClassOf(assetId: string): Promise<string> {
        const asset: Asset = await this.catalog.requireById(assetId);
        if (asset.suggestedClassKey === null) {
            throw new ClassRequiredError(assetId);
        }
        return (await this.resolver.resolveBySystemKey(asset.suggestedClassKey)).id;
    }

    private async classOf(position: Position): Promise<string> {
        return this.assignments.requireClassId(POSITION_SUBJECT_TYPE, position.id);
    }

    private async create(
        assetId: string,
        holderUserId: string | null,
        balance: BalanceState,
        classId: string
    ): Promise<NonNullable<PositionSnapshotEntry['state']>> {
        const created: Position | null = await this.positions.createIfAbsent({
            assetId,
            holderUserId,
            quantity: balance.quantity,
            averagePrice: balance.averagePrice
        });
        if (created === null) {
            throw new Error(`Position for asset "${assetId}" appeared during the import`);
        }
        await this.assignments.assign(POSITION_SUBJECT_TYPE, created.id, classId);
        return { quantity: balance.quantity, averagePrice: balance.averagePrice, classId };
    }

    private async removePosition(position: Position): Promise<void> {
        await this.positions.remove(position.id);
        await this.assignments.release(POSITION_SUBJECT_TYPE, position.id);
    }

    private async assertNoLaterImport(importId: string, stored: readonly InvestmentOperation[]): Promise<void> {
        const newest: Date | undefined = stored
            .map((operation: InvestmentOperation): Date => operation.createdAt)
            .sort((a, b): number => b.getTime() - a.getTime())[0];
        if (newest === undefined) {
            return;
        }
        const assetIds: string[] = [...new Set(stored.map((operation: InvestmentOperation): string => operation.assetId))];
        const later: InvestmentOperation | undefined = (await this.operations.listCreatedAfter(assetIds, newest)).find(
            (operation: InvestmentOperation): boolean => operation.importId !== importId
        );
        if (later !== undefined) {
            const laterImport: InvestmentImport = await this.requireImport(later.importId);
            throw new UndoBlockedByLaterImportError(laterImport.id, DateUtil.onlyDateString(laterImport.createdAt));
        }
    }

    private async restore(after: PositionSnapshotEntry, before: PositionSnapshotEntry | null): Promise<void> {
        const current: Position | null = await this.positions.findByAssetAndHolder(after.assetId, after.holderUserId);
        this.assertUnchanged(after, current);
        const target: PositionSnapshotEntry['state'] = before?.state ?? null;
        if (current !== null && target === null) {
            await this.removePosition(current);
            return;
        }
        if (current !== null && target !== null) {
            await this.positions.update(current.id, { quantity: target.quantity, averagePrice: target.averagePrice });
            return;
        }
        if (target !== null) {
            await this.create(after.assetId, after.holderUserId, target, target.classId);
        }
    }

    private assertUnchanged(after: PositionSnapshotEntry, current: Position | null): void {
        const expected: BalanceState | null =
            after.state === null ? null : { quantity: after.state.quantity, averagePrice: after.state.averagePrice };
        const actual: BalanceState | null = current === null ? null : balanceOfPosition(current);
        if (!sameBalance(expected, actual)) {
            throw new PositionChangedSinceImportError(after.assetId);
        }
    }
}

function assertQuantities(asset: Asset, group: readonly OperationInput[]): void {
    const traded: OperationInput | undefined = group.find(
        (operation: OperationInput): boolean =>
            (operation.kind === OPERATION_KINDS.buy || operation.kind === OPERATION_KINDS.sell) &&
            !fitsDecimals(operation.quantity, asset.quantityDecimals)
    );
    if (traded !== undefined) {
        throw new InvalidQuantityError(asset.quantityDecimals);
    }
}

function groupByAsset(operations: readonly OperationInput[]): Map<string, OperationInput[]> {
    const groups: Map<string, OperationInput[]> = new Map();
    for (const operation of operations) {
        groups.set(operation.assetId, [...(groups.get(operation.assetId) ?? []), operation]);
    }
    return groups;
}

function balanceOfPosition(position: Position): BalanceState {
    return {
        quantity: normalizeDecimal(position.quantity),
        averagePrice: position.averagePrice === null ? null : normalizeDecimal(position.averagePrice)
    };
}

function sameBalance(left: BalanceState | null, right: BalanceState | null): boolean {
    if (left === null || right === null) {
        return left === right;
    }
    return left.quantity === right.quantity && left.averagePrice === right.averagePrice;
}
