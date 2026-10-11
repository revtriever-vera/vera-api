import { AssetClass, ClassAssignment } from '../../src/modules/allocation/domain/allocation.types';

let sequence: number = 0;

export function makeClass(overrides: Partial<AssetClass> = {}): AssetClass {
    sequence += 1;
    return {
        id: `class-${String(sequence)}`,
        companyId: 'company-1',
        systemKey: null,
        aliasKeys: [],
        name: `Classe ${String(sequence)}`,
        colorKey: 'c1',
        targetBps: 0,
        sortOrder: sequence,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        ...overrides
    };
}

export function makeAssignment(overrides: Partial<ClassAssignment> = {}): ClassAssignment {
    sequence += 1;
    return {
        id: `assignment-${String(sequence)}`,
        companyId: 'company-1',
        subjectType: 'position',
        subjectId: `subject-${String(sequence)}`,
        classId: 'class-1',
        targetInClassBps: 0,
        isSample: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        ...overrides
    };
}
