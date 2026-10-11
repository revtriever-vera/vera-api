import { Injectable } from '@nestjs/common';
import { AssetClassDomain } from '../domain/asset-class.domain';
import { ClassAssignmentDomain } from '../domain/class-assignment.domain';
import { ClassNotFoundError } from '../domain/allocation.errors';
import { AssetClass, ClassAssignment, SubjectType } from '../domain/allocation.types';
import { AllocationLogService } from './allocation-log.service';

@Injectable()
export class ClassAssignmentService {
    public constructor(
        private readonly classes: AssetClassDomain,
        private readonly assignments: ClassAssignmentDomain,
        private readonly logs: AllocationLogService
    ) {}

    public async assign(subjectType: SubjectType, subjectId: string, classId: string, isSample: boolean = false): Promise<void> {
        const assetClass: AssetClass | null = await this.classes.findById(classId);
        if (assetClass === null) {
            throw new ClassNotFoundError(classId);
        }
        await this.assignments.assign(subjectType, subjectId, assetClass.id, isSample);
        this.logs.assignmentChanged(subjectType, subjectId, assetClass.id);
    }

    public async release(subjectType: SubjectType, subjectId: string): Promise<void> {
        const released: boolean = await this.assignments.release(subjectType, subjectId);
        if (released) {
            this.logs.assignmentReleased(subjectType, subjectId);
        }
    }

    public async listForCompany(): Promise<readonly ClassAssignment[]> {
        return this.assignments.listAll();
    }
}
