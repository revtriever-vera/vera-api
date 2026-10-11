import { Injectable } from '@nestjs/common';
import { AccountDataExporterPort } from '../../identity/services/account-data-exporter.port';
import { AssetClassDomain } from '../domain/asset-class.domain';
import { ClassAssignmentDomain } from '../domain/class-assignment.domain';
import { PortfolioSettingsDomain } from '../domain/portfolio-settings.domain';
import {
    AssetClass,
    ClassAssignment,
    DEFAULT_BASE_CURRENCY,
    DEFAULT_TOLERANCE_BPS,
    PortfolioSettingsRow
} from '../domain/allocation.types';

export const ALLOCATION_EXPORT_AREA: string = 'allocation';

export interface AllocationClassExport {
    readonly id: string;
    readonly systemKey: string | null;
    readonly aliasKeys: string[];
    readonly name: string | null;
    readonly colorKey: string;
    readonly targetBps: number;
    readonly sortOrder: number;
    readonly createdAt: string;
}

export interface AllocationAssetTargetExport {
    readonly subjectType: string;
    readonly subjectId: string;
    readonly classId: string;
    readonly targetInClassBps: number;
}

export interface AllocationExport {
    readonly settings: { readonly baseCurrency: string; readonly toleranceBps: number };
    readonly classes: AllocationClassExport[];
    readonly assetTargets: AllocationAssetTargetExport[];
}

@Injectable()
export class AllocationAccountExporter extends AccountDataExporterPort {
    public readonly area: string = ALLOCATION_EXPORT_AREA;

    public constructor(
        private readonly classes: AssetClassDomain,
        private readonly assignments: ClassAssignmentDomain,
        private readonly settings: PortfolioSettingsDomain
    ) {
        super();
    }

    public async exportAll(): Promise<AllocationExport> {
        const settings: PortfolioSettingsRow | null = await this.settings.current();
        const classes: AssetClass[] = await this.classes.listActive();
        const assignments: ClassAssignment[] = await this.assignments.listAll();
        return {
            settings: {
                baseCurrency: settings?.baseCurrency ?? DEFAULT_BASE_CURRENCY,
                toleranceBps: settings?.toleranceBps ?? DEFAULT_TOLERANCE_BPS
            },
            classes: classes.map((item: AssetClass): AllocationClassExport => this.classOf(item)),
            assetTargets: assignments
                .filter((assignment: ClassAssignment): boolean => !assignment.isSample)
                .map((assignment: ClassAssignment): AllocationAssetTargetExport => this.assignmentOf(assignment))
        };
    }

    private classOf(item: AssetClass): AllocationClassExport {
        return {
            id: item.id,
            systemKey: item.systemKey,
            aliasKeys: item.aliasKeys,
            name: item.name,
            colorKey: item.colorKey,
            targetBps: item.targetBps,
            sortOrder: item.sortOrder,
            createdAt: item.createdAt.toISOString()
        };
    }

    private assignmentOf(assignment: ClassAssignment): AllocationAssetTargetExport {
        return {
            subjectType: assignment.subjectType,
            subjectId: assignment.subjectId,
            classId: assignment.classId,
            targetInClassBps: assignment.targetInClassBps
        };
    }
}
