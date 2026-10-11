import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { DatabaseClient } from '../../../core/database/database.client';
import { TenantRepository } from '../../../core/database/repositories/tenant.repository';
import { IdUtil } from '../../../shared/utils/id.util';
import { ClassAssignment, NewClassAssignment } from '../domain/allocation.types';

type CreateAssignmentData = Pick<NewClassAssignment, 'subjectType' | 'subjectId' | 'classId' | 'isSample'>;

const ASSIGNMENT_LIMIT: number = 10000;

@Injectable()
export class ClassAssignmentsRepository extends TenantRepository<'AssetClassAssignments'> {
    public constructor(database: DatabaseClient, context: AppContext) {
        super(database, context, 'AssetClassAssignments');
    }

    public async create(data: CreateAssignmentData): Promise<ClassAssignment> {
        return this.createRow({ id: IdUtil.newId(), companyId: this.companyId, ...data });
    }

    public async findBySubject(subjectType: string, subjectId: string): Promise<ClassAssignment | null> {
        return this.findOne({ subjectType, subjectId });
    }

    public async listAll(): Promise<ClassAssignment[]> {
        return this.findMany({}, { limit: ASSIGNMENT_LIMIT, orderBy: [{ property: 'createdAt', direction: 'asc' }] });
    }

    public async listByClass(classId: string): Promise<ClassAssignment[]> {
        return this.findMany({ classId }, { limit: ASSIGNMENT_LIMIT, orderBy: [{ property: 'createdAt', direction: 'asc' }] });
    }

    public async existsInClass(classId: string): Promise<boolean> {
        const rows: ClassAssignment[] = await this.findMany({ classId }, { limit: 1 });
        return rows.length > 0;
    }

    public async changeClass(id: string, classId: string): Promise<ClassAssignment | null> {
        return this.updateRow(id, { classId, targetInClassBps: 0 });
    }

    public async moveAll(fromClassId: string, toClassId: string): Promise<void> {
        await this.updateManyRows({ classId: fromClassId }, { classId: toClassId });
    }

    public async setTargetInClass(id: string, targetInClassBps: number): Promise<void> {
        await this.updateRow(id, { targetInClassBps });
    }

    public async softDelete(id: string): Promise<void> {
        await this.softDeleteRow(id);
    }
}
