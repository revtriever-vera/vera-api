import { Injectable } from '@nestjs/common';
import { ClassAssignmentsRepository } from '../repositories/class-assignments.repository';
import { ClassAssignment, SubjectType } from './allocation.types';

export interface TargetUpdate {
    readonly assignmentId: string;
    readonly targetInClassBps: number;
}

@Injectable()
export class ClassAssignmentDomain {
    public constructor(private readonly assignments: ClassAssignmentsRepository) {}

    public async assign(subjectType: SubjectType, subjectId: string, classId: string, isSample: boolean = false): Promise<ClassAssignment> {
        const current: ClassAssignment | null = await this.assignments.findBySubject(subjectType, subjectId);
        if (current === null) {
            return this.assignments.create({ subjectType, subjectId, classId, isSample });
        }
        return this.moveIfChanged(current, classId);
    }

    public async reassign(subjectType: SubjectType, subjectId: string, classId: string): Promise<ClassAssignment | null> {
        const current: ClassAssignment | null = await this.assignments.findBySubject(subjectType, subjectId);
        if (current === null) {
            return null;
        }
        return this.moveIfChanged(current, classId);
    }

    public async release(subjectType: SubjectType, subjectId: string): Promise<boolean> {
        const current: ClassAssignment | null = await this.assignments.findBySubject(subjectType, subjectId);
        if (current === null) {
            return false;
        }
        await this.assignments.softDelete(current.id);
        return true;
    }

    public async listAll(): Promise<ClassAssignment[]> {
        return this.assignments.listAll();
    }

    public async listByClass(classId: string): Promise<ClassAssignment[]> {
        return this.assignments.listByClass(classId);
    }

    public async classHasAssignments(classId: string): Promise<boolean> {
        return this.assignments.existsInClass(classId);
    }

    public async moveAll(fromClassId: string, toClassId: string): Promise<void> {
        await this.assignments.moveAll(fromClassId, toClassId);
    }

    public async applyTargets(updates: readonly TargetUpdate[]): Promise<void> {
        for (const update of updates) {
            await this.assignments.setTargetInClass(update.assignmentId, update.targetInClassBps);
        }
    }

    private async moveIfChanged(current: ClassAssignment, classId: string): Promise<ClassAssignment> {
        if (current.classId === classId) {
            return current;
        }
        return (await this.assignments.changeClass(current.id, classId)) ?? current;
    }
}
