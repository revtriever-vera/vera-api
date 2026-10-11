import type { ClassSummary, Holding, PortfolioSnapshot } from '../../portfolio/services/portfolio-snapshot.service';
import { DecimalUtil } from '../../../shared/utils/decimal.util';
import { allocate, AllocationItem } from './allocate';
import { approxUnits } from './approx-units';
import { ContributionTargetsNotSetError } from './contribution.errors';
import {
    AssetSuggestion,
    ClassSuggestion,
    CONTRIBUTION_WARNINGS,
    ContributionSuggestion,
    ContributionWarning,
    NO_ASSETS_NOTE,
    TypeGroup
} from './contribution.types';

const BPS_TOTAL: number = 10000;

interface Funded<T> {
    readonly item: T;
    readonly amountMinor: number;
}

function bpsOf(part: number, whole: number): number {
    return whole <= 0 ? 0 : DecimalUtil.roundHalfUpToInteger(DecimalUtil.of(part).mul(BPS_TOTAL).div(whole));
}

function fundedOnly<T>(items: readonly T[], amounts: readonly number[]): Funded<T>[] {
    return items
        .map((item: T, index: number): Funded<T> => ({ item, amountMinor: amounts[index] ?? 0 }))
        .filter((funded: Funded<T>): boolean => funded.amountMinor > 0)
        .sort((left: Funded<T>, right: Funded<T>): number => right.amountMinor - left.amountMinor);
}

function unitsOf(snapshot: PortfolioSnapshot, holding: Holding, amountMinor: number): string | null {
    if (holding.kind !== 'position' || holding.unitPrice === null || holding.priceCurrency === null) {
        return null;
    }
    return approxUnits(
        amountMinor,
        holding.unitPrice,
        holding.priceCurrency,
        snapshot.baseCurrency,
        snapshot.usdRate?.brlPerUnit ?? null,
        holding.quantityDecimals ?? 0
    );
}

function assetSuggestion(snapshot: PortfolioSnapshot, funded: Funded<Holding>, classValue: number, classAmount: number): AssetSuggestion {
    const holding: Holding = funded.item;
    return {
        kind: holding.kind,
        id: holding.id,
        assetId: holding.assetId,
        typeGroup: holding.typeGroup as TypeGroup,
        symbol: holding.symbol,
        name: holding.name,
        amountMinor: funded.amountMinor,
        approxUnits: unitsOf(snapshot, holding, funded.amountMinor),
        unitPrice: holding.unitPrice,
        priceCurrency: holding.priceCurrency,
        shareInClassBeforeBps: bpsOf(holding.valueMinor, classValue),
        shareInClassAfterBps: bpsOf(holding.valueMinor + funded.amountMinor, classValue + classAmount),
        targetInClassBps: holding.effectiveTargetInClassBps
    };
}

function assetsOf(snapshot: PortfolioSnapshot, summary: ClassSummary, classAmount: number): AssetSuggestion[] {
    const eligible: Holding[] = snapshot.holdings.filter(
        (holding: Holding): boolean => holding.classId === summary.classId && !holding.matured
    );
    const items: AllocationItem[] = eligible.map((holding: Holding): AllocationItem => ({
        key: holding.id,
        currentMinor: holding.valueMinor,
        targetBps: holding.effectiveTargetInClassBps
    }));
    return fundedOnly(eligible, allocate(classAmount, items)).map((funded: Funded<Holding>): AssetSuggestion =>
        assetSuggestion(snapshot, funded, summary.valueMinor, classAmount)
    );
}

function classSuggestion(snapshot: PortfolioSnapshot, funded: Funded<ClassSummary>, totalAfter: number): ClassSuggestion {
    const summary: ClassSummary = funded.item;
    const assets: AssetSuggestion[] = assetsOf(snapshot, summary, funded.amountMinor);
    return {
        classId: summary.classId,
        systemKey: summary.systemKey,
        name: summary.name,
        colorKey: summary.colorKey,
        amountMinor: funded.amountMinor,
        valueBeforeMinor: summary.valueMinor,
        shareBeforeBps: summary.shareBps,
        shareAfterBps: bpsOf(summary.valueMinor + funded.amountMinor, totalAfter),
        targetBps: summary.targetBps,
        note: assets.length === 0 ? NO_ASSETS_NOTE : null,
        assets
    };
}

function warningsOf(targetsSum: number): ContributionWarning[] {
    return targetsSum === BPS_TOTAL ? [] : [CONTRIBUTION_WARNINGS.classTargetsNot100];
}

export function buildSuggestion(snapshot: PortfolioSnapshot, amountMinor: number): ContributionSuggestion {
    const targetsSum: number = snapshot.classes.reduce((sum: number, summary: ClassSummary): number => sum + summary.targetBps, 0);
    if (targetsSum === 0) {
        throw new ContributionTargetsNotSetError();
    }
    const items: AllocationItem[] = snapshot.classes.map((summary: ClassSummary): AllocationItem => ({
        key: summary.classId,
        currentMinor: summary.valueMinor,
        targetBps: summary.targetBps
    }));
    const totalAfter: number = snapshot.totalMinor + amountMinor;
    return {
        baseCurrency: snapshot.baseCurrency === 'USD' ? 'USD' : 'BRL',
        amountMinor,
        totalBeforeMinor: snapshot.totalMinor,
        totalAfterMinor: totalAfter,
        warnings: warningsOf(targetsSum),
        classes: fundedOnly(snapshot.classes, allocate(amountMinor, items)).map((funded: Funded<ClassSummary>): ClassSuggestion =>
            classSuggestion(snapshot, funded, totalAfter)
        )
    };
}
