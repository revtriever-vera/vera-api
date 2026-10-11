import { Injectable } from '@nestjs/common';
import { UsingTransaction } from '../../../core/database/using-transaction.decorator';
import { AssetClassDomain } from '../domain/asset-class.domain';
import { toAssetClassView, toAssetTargetView } from '../domain/asset-class.mapper';
import { ClassAssignmentDomain } from '../domain/class-assignment.domain';
import { ClassNotFoundError, TargetsIncompleteError, TargetsMustSum100Error } from '../domain/allocation.errors';
import {
    AssetClass,
    AssetClassView,
    AssetTargetsView,
    ClassAssignment,
    TARGET_RESULTS,
    TARGET_SCOPES,
    TargetResult,
    TargetScope
} from '../domain/allocation.types';
import {
    AssetTargetInput,
    AssetTargetUpdate,
    ClassTargetInput,
    ClassTargetUpdate,
    moderateTargets,
    resolveAssetTargets,
    resolveClassTargets
} from '../domain/targets';
import { AllocationLogService } from '../services/allocation-log.service';
import { AllocationMetricsService } from '../services/allocation-metrics.service';
import { ClassReaderService } from '../services/class-reader.service';

@Injectable()
export class ClassTargetsApplication {
    public constructor(
        private readonly classes: AssetClassDomain,
        private readonly assignments: ClassAssignmentDomain,
        private readonly reader: ClassReaderService,
        private readonly logs: AllocationLogService,
        private readonly metrics: AllocationMetricsService
    ) {}

    @UsingTransaction()
    public async saveClassTargets(inputs: readonly ClassTargetInput[]): Promise<AssetClassView[]> {
        return this.recording(TARGET_SCOPES.classes, null, async () => {
            const existing: readonly AssetClass[] = await this.reader.listForCompany();
            const updates: ClassTargetUpdate[] = resolveClassTargets(existing, inputs);
            await this.classes.applyTargets(updates);
            return this.currentViews();
        });
    }

    @UsingTransaction()
    public async saveAssetTargets(classId: string, inputs: readonly AssetTargetInput[]): Promise<AssetTargetsView> {
        return this.recording(TARGET_SCOPES.assets, classId, async () => {
            const assetClass: AssetClass | null = await this.classes.findById(classId);
            if (assetClass === null) {
                throw new ClassNotFoundError(classId);
            }
            const current: ClassAssignment[] = await this.assignments.listByClass(classId);
            const updates: AssetTargetUpdate[] = resolveAssetTargets(classId, current, inputs);
            await this.assignments.applyTargets(updates);
            const saved: ClassAssignment[] = await this.assignments.listByClass(classId);
            return { classId, targets: saved.map(toAssetTargetView) };
        });
    }

    @UsingTransaction()
    public async reset(): Promise<AssetClassView[]> {
        return this.recording(TARGET_SCOPES.reset, null, async () => {
            const existing: readonly AssetClass[] = await this.reader.listForCompany();
            await this.classes.applyTargets(moderateTargets(existing));
            return this.currentViews();
        });
    }

    private async currentViews(): Promise<AssetClassView[]> {
        return (await this.reader.listForCompany()).map(toAssetClassView);
    }

    private async recording<T>(scope: TargetScope, classId: string | null, operation: () => Promise<T>): Promise<T> {
        try {
            const result: T = await operation();
            this.logs.targetsSaved(scope, classId);
            this.metrics.targetSave(scope, TARGET_RESULTS.saved);
            return result;
        } catch (error) {
            this.metrics.targetSave(scope, this.resultOf(error));
            throw error;
        }
    }

    private resultOf(error: unknown): TargetResult {
        if (error instanceof TargetsMustSum100Error) {
            return TARGET_RESULTS.mustSum100;
        }
        if (error instanceof TargetsIncompleteError) {
            return TARGET_RESULTS.incomplete;
        }
        return TARGET_RESULTS.failed;
    }
}
