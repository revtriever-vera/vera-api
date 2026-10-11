import {
    AssetClass,
    AssetClassView,
    AssetTargetView,
    BASE_CURRENCIES,
    BaseCurrency,
    ClassAssignment,
    ClassAssignmentView,
    PortfolioSettingsRow,
    PortfolioSettingsView
} from './allocation.types';

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

export function toAssetTargetView(assignment: ClassAssignment): AssetTargetView {
    return {
        subjectType: assignment.subjectType,
        subjectId: assignment.subjectId,
        targetInClassBps: assignment.targetInClassBps
    };
}

export function toPortfolioSettingsView(settings: PortfolioSettingsRow): PortfolioSettingsView {
    const baseCurrency: BaseCurrency = settings.baseCurrency === BASE_CURRENCIES.usd ? BASE_CURRENCIES.usd : BASE_CURRENCIES.brl;
    return { baseCurrency, toleranceBps: settings.toleranceBps };
}
