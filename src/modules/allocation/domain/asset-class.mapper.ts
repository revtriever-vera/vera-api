import { AssetClass, AssetClassView, ClassAssignment, ClassAssignmentView } from './allocation.types';

export function toAssetClassView(assetClass: AssetClass): AssetClassView {
    return {
        id: assetClass.id,
        systemKey: assetClass.systemKey,
        aliasKeys: assetClass.aliasKeys,
        name: assetClass.name,
        colorKey: assetClass.colorKey,
        targetBps: assetClass.targetBps,
        sortOrder: assetClass.sortOrder
    };
}

export function toClassAssignmentView(assignment: ClassAssignment): ClassAssignmentView {
    return {
        subjectType: assignment.subjectType,
        subjectId: assignment.subjectId,
        classId: assignment.classId,
        targetInClassBps: assignment.targetInClassBps
    };
}
