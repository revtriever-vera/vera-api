import { FGC_CAP_MINOR, FGC_COVERED_TITLE_KINDS, FGC_CURRENCY, FGC_LIMIT_PER_GROUP_MINOR } from './fgc.constants';
import {
    FgcGroup,
    FgcGroupTitle,
    FgcHolding,
    FgcIssuer,
    FgcOutside,
    FgcSimulation,
    OUTSIDE_REASONS,
    OutsideReason,
    VERDICTS,
    Verdict
} from './fgc.types';

const BASIS_POINTS: number = 10_000;
const BANK: string = 'bank';
const SOVEREIGN: string = 'sovereign';
const OTHER: string = 'other';
const SIMULATED_ID: string = 'simulated';

export interface FgcResult {
    readonly groups: readonly FgcGroup[];
    readonly outside: readonly FgcOutside[];
    readonly coveredMinor: number;
    readonly capShareBps: number;
}

interface GroupAccumulator {
    readonly groupId: string;
    readonly groupName: string;
    totalMinor: number;
    readonly titles: FgcGroupTitle[];
}

export function isCoveredKind(kind: string | null): boolean {
    return kind !== null && FGC_COVERED_TITLE_KINDS.includes(kind);
}

function issuerIsCovered(issuer: FgcIssuer): boolean {
    return issuer.kind === BANK && issuer.fgcAssociated;
}

/** Why a holding stays out of the FGC; null when it is eligible. A matured security is not a holding for this rule. */
export function outsideReasonOf(holding: FgcHolding): OutsideReason | null {
    if (holding.treasury || holding.issuer?.kind === SOVEREIGN) {
        return OUTSIDE_REASONS.tesouro;
    }
    if (holding.currency !== FGC_CURRENCY) {
        return OUTSIDE_REASONS.foreign;
    }
    if (holding.issuer?.kind === OTHER) {
        return OUTSIDE_REASONS.notCalculated;
    }
    if (!isCoveredKind(holding.kind)) {
        return OUTSIDE_REASONS.notCoveredKind;
    }
    if (holding.issuer === null) {
        return OUTSIDE_REASONS.missingIssuer;
    }
    return issuerIsCovered(holding.issuer) ? null : OUTSIDE_REASONS.notAssociated;
}

function groupOf(accumulator: GroupAccumulator): FgcGroup {
    return {
        groupId: accumulator.groupId,
        groupName: accumulator.groupName,
        totalMinor: accumulator.totalMinor,
        coveredMinor: Math.min(accumulator.totalMinor, FGC_LIMIT_PER_GROUP_MINOR),
        overMinor: Math.max(0, accumulator.totalMinor - FGC_LIMIT_PER_GROUP_MINOR),
        titles: accumulator.titles
    };
}

function addToGroup(accumulators: Map<string, GroupAccumulator>, holding: FgcHolding, issuer: FgcIssuer): void {
    const accumulator: GroupAccumulator = accumulators.get(issuer.groupId) ?? {
        groupId: issuer.groupId,
        groupName: issuer.groupName,
        totalMinor: 0,
        titles: []
    };
    accumulator.totalMinor += holding.valueMinor;
    accumulator.titles.push({
        id: holding.id,
        name: holding.name,
        issuerName: issuer.name,
        kind: holding.kind as string,
        valueMinor: holding.valueMinor,
        estimated: holding.estimated
    });
    accumulators.set(issuer.groupId, accumulator);
}

function outsideOf(holding: FgcHolding, reason: OutsideReason): FgcOutside {
    return { id: holding.id, name: holding.name, reason, valueMinor: holding.valueMinor };
}

export function computeCoverage(holdings: readonly FgcHolding[]): FgcResult {
    const accumulators: Map<string, GroupAccumulator> = new Map<string, GroupAccumulator>();
    const outside: FgcOutside[] = [];
    for (const holding of holdings) {
        const reason: OutsideReason | null = holding.matured ? null : outsideReasonOf(holding);
        if (holding.matured) {
            continue;
        }
        if (reason !== null || holding.issuer === null) {
            outside.push(outsideOf(holding, reason ?? OUTSIDE_REASONS.missingIssuer));
            continue;
        }
        addToGroup(accumulators, holding, holding.issuer);
    }
    const groups: FgcGroup[] = [...accumulators.values()]
        .map(groupOf)
        .sort((a: FgcGroup, b: FgcGroup): number => b.totalMinor - a.totalMinor);
    const coveredMinor: number = groups.reduce((sum: number, group: FgcGroup): number => sum + group.coveredMinor, 0);
    return { groups, outside, coveredMinor, capShareBps: Math.round((coveredMinor * BASIS_POINTS) / FGC_CAP_MINOR) };
}

function verdictOf(reason: OutsideReason): Verdict {
    if (reason === OUTSIDE_REASONS.notCoveredKind) {
        return VERDICTS.notCoveredKind;
    }
    return reason === OUTSIDE_REASONS.notCalculated ? VERDICTS.notCalculated : VERDICTS.notAssociated;
}

export interface SimulationCandidate {
    readonly issuer: FgcIssuer;
    readonly kind: string;
    readonly valueMinor: number;
    readonly excludeTitleId: string | undefined;
}

/** The state of the issuer group with a hypothetical BRL security; the security being edited is not counted twice. */
export function simulate(holdings: readonly FgcHolding[], candidate: SimulationCandidate): FgcSimulation {
    const others: FgcHolding[] = holdings.filter((holding: FgcHolding): boolean => holding.id !== candidate.excludeTitleId);
    const before: FgcGroup | undefined = computeCoverage(others).groups.find(
        (group: FgcGroup): boolean => group.groupId === candidate.issuer.groupId
    );
    const base: Pick<FgcSimulation, 'groupId' | 'groupName'> = {
        groupId: candidate.issuer.groupId,
        groupName: candidate.issuer.groupName
    };
    const reason: OutsideReason | null = outsideReasonOf(hypotheticalOf(candidate));
    if (reason !== null) {
        return { ...base, verdict: verdictOf(reason), totalAfterMinor: before?.totalMinor ?? 0, overMinor: before?.overMinor ?? 0 };
    }
    const totalAfterMinor: number = (before?.totalMinor ?? 0) + candidate.valueMinor;
    const overMinor: number = Math.max(0, totalAfterMinor - FGC_LIMIT_PER_GROUP_MINOR);
    return { ...base, verdict: overMinor > 0 ? VERDICTS.overLimit : VERDICTS.covered, totalAfterMinor, overMinor };
}

function hypotheticalOf(candidate: SimulationCandidate): FgcHolding {
    return {
        id: SIMULATED_ID,
        name: SIMULATED_ID,
        kind: candidate.kind,
        currency: FGC_CURRENCY,
        valueMinor: candidate.valueMinor,
        estimated: false,
        matured: false,
        treasury: false,
        holderUserId: null,
        issuer: candidate.issuer
    };
}
