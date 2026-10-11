import { Injectable } from '@nestjs/common';
import { UsingTransaction } from '../../../core/database/using-transaction.decorator';
import { AssetClassDomain } from '../domain/asset-class.domain';
import { toAssetClassView } from '../domain/asset-class.mapper';
import { ClassAssignmentDomain, TargetUpdate } from '../domain/class-assignment.domain';
import {
    CannotMergeIntoSelfError,
    ClassLimitReachedError,
    ClassNameRequiredError,
    ClassNameTakenError,
    ClassNotEmptyError,
    ClassNotFoundError,
    SystemClassNotDeletableError
} from '../domain/allocation.errors';
import {
    AssetClass,
    AssetClassView,
    CLASS_ACTIONS,
    ClassAction,
    ClassAssignment,
    MAX_BPS,
    MAX_CLASSES_PER_COMPANY
} from '../domain/allocation.types';
import { mergeInClassTargets } from '../domain/class-merge';
import { AllocationLogService } from '../services/allocation-log.service';
import { AllocationMetricsService } from '../services/allocation-metrics.service';
import { ClassDisplayNameService } from '../services/class-display-name.service';
import { ClassReaderService } from '../services/class-reader.service';

export interface CreateClassPayload {
    readonly name: string;
    readonly colorKey?: string;
}

export interface UpdateClassPayload {
    readonly name?: string | null;
    readonly colorKey?: string;
}

@Injectable()
export class AssetClassApplication {
    public constructor(
        private readonly classes: AssetClassDomain,
        private readonly assignments: ClassAssignmentDomain,
        private readonly reader: ClassReaderService,
        private readonly displayNames: ClassDisplayNameService,
        private readonly logs: AllocationLogService,
        private readonly metrics: AllocationMetricsService
    ) {}

    public async list(): Promise<AssetClassView[]> {
        const classes: readonly AssetClass[] = await this.reader.listForCompany();
        return classes.map(toAssetClassView);
    }

    public async create(payload: CreateClassPayload): Promise<AssetClassView> {
        const existing: readonly AssetClass[] = await this.reader.listForCompany();
        if (existing.length >= MAX_CLASSES_PER_COMPANY) {
            throw new ClassLimitReachedError(MAX_CLASSES_PER_COMPANY);
        }
        this.assertNameFree(payload.name, existing, null);
        const created: AssetClass = await this.classes.create(payload, existing);
        this.recordAction(CLASS_ACTIONS.created, created.id);
        return toAssetClassView(created);
    }

    public async update(id: string, payload: UpdateClassPayload): Promise<AssetClassView> {
        const existing: readonly AssetClass[] = await this.reader.listForCompany();
        const current: AssetClass = this.requireIn(existing, id);
        this.assertRenameAllowed(current, payload.name, existing);
        const updated: AssetClass | null = await this.classes.update(id, payload);
        if (updated === null) {
            throw new ClassNotFoundError(id);
        }
        if (payload.name !== undefined) {
            this.recordAction(CLASS_ACTIONS.renamed, id);
        }
        return toAssetClassView(updated);
    }

    @UsingTransaction()
    public async merge(id: string, intoClassId: string): Promise<AssetClassView> {
        if (id === intoClassId) {
            throw new CannotMergeIntoSelfError();
        }
        const existing: readonly AssetClass[] = await this.reader.listForCompany();
        const origin: AssetClass = this.requireIn(existing, id);
        const destination: AssetClass = this.requireIn(existing, intoClassId);
        const targetBps: number = Math.min(MAX_BPS, origin.targetBps + destination.targetBps);
        const updates: TargetUpdate[] = await this.recomposedTargets(origin, destination);
        await this.assignments.moveAll(origin.id, destination.id);
        await this.assignments.applyTargets(updates);
        const merged: AssetClass | null = await this.classes.absorb({ origin, destination, targetBps });
        this.recordAction(CLASS_ACTIONS.merged, destination.id);
        return toAssetClassView(merged ?? destination);
    }

    public async remove(id: string): Promise<void> {
        const existing: readonly AssetClass[] = await this.reader.listForCompany();
        const current: AssetClass = this.requireIn(existing, id);
        if (current.systemKey !== null) {
            throw new SystemClassNotDeletableError(id);
        }
        if (await this.assignments.classHasAssignments(id)) {
            throw new ClassNotEmptyError(id);
        }
        await this.classes.remove(id);
        this.recordAction(CLASS_ACTIONS.deleted, id);
    }

    private async recomposedTargets(origin: AssetClass, destination: AssetClass): Promise<TargetUpdate[]> {
        const originAssignments: ClassAssignment[] = await this.assignments.listByClass(origin.id);
        const destinationAssignments: ClassAssignment[] = await this.assignments.listByClass(destination.id);
        const merged: Map<string, number> = mergeInClassTargets({
            originClassBps: origin.targetBps,
            destinationClassBps: destination.targetBps,
            origin: this.targetsById(originAssignments),
            destination: this.targetsById(destinationAssignments)
        });
        return [...merged.entries()].map(([assignmentId, targetInClassBps]: [string, number]) => ({ assignmentId, targetInClassBps }));
    }

    private targetsById(assignments: readonly ClassAssignment[]): Map<string, number> {
        return new Map<string, number>(assignments.map((item: ClassAssignment): [string, number] => [item.id, item.targetInClassBps]));
    }

    private requireIn(classes: readonly AssetClass[], id: string): AssetClass {
        const found: AssetClass | undefined = classes.find((item: AssetClass) => item.id === id);
        if (found === undefined) {
            throw new ClassNotFoundError(id);
        }
        return found;
    }

    private assertRenameAllowed(current: AssetClass, name: string | null | undefined, existing: readonly AssetClass[]): void {
        if (name === null && current.systemKey === null) {
            throw new ClassNameRequiredError();
        }
        if (typeof name === 'string') {
            this.assertNameFree(name, existing, current.id);
        }
    }

    private assertNameFree(name: string, existing: readonly AssetClass[], ignoreId: string | null): void {
        const taken: Set<string> = new Set<string>(
            existing.filter((item: AssetClass) => item.id !== ignoreId).flatMap((item: AssetClass) => this.displayNames.takenNamesOf(item))
        );
        if (taken.has(name.toLowerCase())) {
            throw new ClassNameTakenError();
        }
    }

    private recordAction(action: ClassAction, classId: string): void {
        this.logs.classChanged(action, classId);
        this.metrics.classAction(action);
    }
}
