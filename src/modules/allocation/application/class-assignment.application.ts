import { Injectable } from '@nestjs/common';
import { AssetClassDomain } from '../domain/asset-class.domain';
import { toClassAssignmentView } from '../domain/asset-class.mapper';
import { ClassAssignmentDomain } from '../domain/class-assignment.domain';
import { AssignmentNotFoundError, ClassNotFoundError } from '../domain/allocation.errors';
import { AssetClass, ClassAssignment, ClassAssignmentView, SubjectType } from '../domain/allocation.types';
import { AllocationLogService } from '../services/allocation-log.service';

@Injectable()
export class ClassAssignmentApplication {
    public constructor(
        private readonly classes: AssetClassDomain,
        private readonly assignments: ClassAssignmentDomain,
        private readonly logs: AllocationLogService
    ) {}

    public async reassign(subjectType: SubjectType, subjectId: string, classId: string): Promise<ClassAssignmentView> {
        const assetClass: AssetClass | null = await this.classes.findById(classId);
        if (assetClass === null) {
            throw new ClassNotFoundError(classId);
        }
        const assignment: ClassAssignment | null = await this.assignments.reassign(subjectType, subjectId, assetClass.id);
        if (assignment === null) {
            throw new AssignmentNotFoundError(subjectType, subjectId);
        }
        this.logs.assignmentChanged(subjectType, subjectId, assetClass.id);
        return toClassAssignmentView(assignment);
    }
}
