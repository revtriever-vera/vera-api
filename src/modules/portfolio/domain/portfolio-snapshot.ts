import { dollarExposureOf } from './dollar-exposure';
import { largestDeviationOf, outsideCountOf, summarizeClasses } from './class-summary';
import { effectiveAssetTargets, TargetCandidate } from './effective-targets';
import { BareHolding, positionHolding, titleHolding, ValuationContext } from './holding-builder';
import {
    ClassSummary,
    HOLDING_KINDS,
    Holding,
    OrphanHolding,
    PortfolioQuality,
    PortfolioSnapshot,
    PortfolioSourceData,
    SourceAsset,
    SourceAssignment,
    SourceClass,
    SourcePosition,
    SourceQuote,
    SourceTitle
} from './portfolio.types';

interface Placement {
    readonly classId: string | null;
    readonly storedTargetInClassBps: number;
}

function keyOf(subjectType: string, subjectId: string): string {
    return `${subjectType}:${subjectId}`;
}

function bareHoldingsOf(source: PortfolioSourceData): BareHolding[] {
    const context: ValuationContext = { baseCurrency: source.baseCurrency, usdRate: source.usdRate };
    const assets: Map<string, SourceAsset> = new Map<string, SourceAsset>(
        source.assets.map((asset: SourceAsset): [string, SourceAsset] => [asset.id, asset])
    );
    const quotes: Map<string, SourceQuote> = new Map<string, SourceQuote>(
        source.quotes.map((quote: SourceQuote): [string, SourceQuote] => [quote.assetId, quote])
    );
    const positions: BareHolding[] = source.positions.flatMap((position: SourcePosition): BareHolding[] => {
        const asset: SourceAsset | undefined = assets.get(position.assetId);
        return asset === undefined ? [] : [positionHolding(position, asset, quotes.get(asset.id) ?? null, context)];
    });
    return [...positions, ...source.titles.map((title: SourceTitle): BareHolding => titleHolding(title, context))];
}

function placementsOf(assignments: readonly SourceAssignment[]): Map<string, Placement> {
    return new Map<string, Placement>(
        assignments.map((assignment: SourceAssignment): [string, Placement] => [
            keyOf(assignment.subjectType, assignment.subjectId),
            { classId: assignment.classId, storedTargetInClassBps: assignment.targetInClassBps }
        ])
    );
}

function placeAll(bare: readonly BareHolding[], assignments: readonly SourceAssignment[], knownClassIds: ReadonlySet<string>): Holding[] {
    const placements: Map<string, Placement> = placementsOf(assignments);
    return bare.map((holding: BareHolding): Holding => {
        const found: Placement | undefined = placements.get(keyOf(holding.kind, holding.id));
        const placed: boolean = found !== undefined && knownClassIds.has(found.classId ?? '');
        return {
            ...holding,
            classId: placed ? (found?.classId ?? null) : null,
            storedTargetInClassBps: placed ? (found?.storedTargetInClassBps ?? 0) : 0,
            effectiveTargetInClassBps: 0
        };
    });
}

function withEffectiveTargets(holdings: readonly Holding[]): Holding[] {
    const byClass: Map<string, TargetCandidate[]> = new Map<string, TargetCandidate[]>();
    for (const holding of holdings) {
        if (holding.classId !== null) {
            const group: TargetCandidate[] = byClass.get(holding.classId) ?? [];
            group.push({ id: holding.id, valueMinor: holding.valueMinor, storedBps: holding.storedTargetInClassBps });
            byClass.set(holding.classId, group);
        }
    }
    const effective: Map<string, number> = new Map<string, number>(
        [...byClass.values()].flatMap((group: TargetCandidate[]): [string, number][] => [...effectiveAssetTargets(group).entries()])
    );
    return holdings.map((holding: Holding): Holding => ({ ...holding, effectiveTargetInClassBps: effective.get(holding.id) ?? 0 }));
}

function sortHoldings(holdings: readonly Holding[], classes: readonly ClassSummary[]): Holding[] {
    const order: Map<string, number> = new Map<string, number>(
        classes.map((item: ClassSummary): [string, number] => [item.classId, item.sortOrder])
    );
    const rank = (holding: Holding): number =>
        holding.classId === null ? Number.MAX_SAFE_INTEGER : (order.get(holding.classId) ?? Number.MAX_SAFE_INTEGER);
    return [...holdings].sort(
        (left: Holding, right: Holding) => rank(left) - rank(right) || right.valueMinor - left.valueMinor || left.id.localeCompare(right.id)
    );
}

function qualityOf(holdings: readonly Holding[]): PortfolioQuality {
    const count = (predicate: (holding: Holding) => boolean): number => holdings.filter(predicate).length;
    return {
        missingQuotes: count((holding: Holding): boolean => holding.missingQuote),
        staleQuotes: count((holding: Holding): boolean => holding.stale),
        estimatedFixedIncome: count((holding: Holding): boolean => holding.kind === HOLDING_KINDS.fixedIncome && holding.estimated),
        indexDataMissing: count((holding: Holding): boolean => holding.indexDataMissing),
        missingRates: count((holding: Holding): boolean => holding.missingRate)
    };
}

function sumOf(holdings: readonly Holding[]): number {
    return holdings.reduce((sum: number, holding: Holding) => sum + holding.valueMinor, 0);
}

function orphansOf(holdings: readonly Holding[]): Holding[] {
    return holdings.filter((holding: Holding): boolean => holding.classId === null);
}

function headerOf(source: PortfolioSourceData): Pick<PortfolioSnapshot, 'baseCurrency' | 'asOf' | 'toleranceBps' | 'usdRate'> {
    return { baseCurrency: source.baseCurrency, asOf: source.asOf, toleranceBps: source.toleranceBps, usdRate: source.usdRate };
}

function orphanRefsOf(orphans: readonly Holding[]): OrphanHolding[] {
    return orphans.map((holding: Holding): OrphanHolding => ({ subjectType: holding.kind, subjectId: holding.id }));
}

interface Classified {
    readonly holdings: Holding[];
    readonly classes: ClassSummary[];
    readonly totalMinor: number;
}

function classify(source: PortfolioSourceData): Classified {
    const knownClassIds: Set<string> = new Set<string>(source.classes.map((item: SourceClass): string => item.id));
    const placed: Holding[] = withEffectiveTargets(placeAll(bareHoldingsOf(source), source.assignments, knownClassIds));
    const totalMinor: number = sumOf(placed);
    const classes: ClassSummary[] = summarizeClasses({
        classes: source.classes,
        holdings: placed,
        totalMinor,
        toleranceBps: source.toleranceBps
    });
    return { holdings: sortHoldings(placed, classes), classes, totalMinor };
}

export function buildSnapshot(source: PortfolioSourceData): PortfolioSnapshot {
    const { holdings, classes, totalMinor }: Classified = classify(source);
    const orphans: Holding[] = orphansOf(holdings);
    return {
        ...headerOf(source),
        totalMinor,
        unclassifiedMinor: sumOf(orphans),
        empty: holdings.length === 0,
        dollarExposure: dollarExposureOf(holdings, totalMinor),
        classes,
        holdings,
        outsideCount: totalMinor > 0 ? outsideCountOf(classes) : 0,
        largestDeviation: largestDeviationOf(classes, totalMinor),
        quality: qualityOf(holdings),
        orphanHoldings: orphanRefsOf(orphans)
    };
}
