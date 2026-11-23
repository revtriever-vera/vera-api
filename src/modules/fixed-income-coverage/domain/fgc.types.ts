export const OUTSIDE_REASONS = {
    tesouro: 'tesouro',
    notCoveredKind: 'not_covered_kind',
    notAssociated: 'not_associated',
    foreign: 'foreign',
    missingIssuer: 'missing_issuer',
    notCalculated: 'not_calculated'
} as const;

export type OutsideReason = (typeof OUTSIDE_REASONS)[keyof typeof OUTSIDE_REASONS];

export const VERDICTS = {
    covered: 'covered',
    overLimit: 'over_limit',
    notCoveredKind: 'not_covered_kind',
    notAssociated: 'not_associated',
    notCalculated: 'not_calculated'
} as const;

export type Verdict = (typeof VERDICTS)[keyof typeof VERDICTS];

export const FGC_ENDPOINTS = {
    coverage: 'coverage',
    simulate: 'simulate'
} as const;

export type FgcEndpoint = (typeof FGC_ENDPOINTS)[keyof typeof FGC_ENDPOINTS];

/** The issuer already resolved to the current conglomerate (an absorbed institution counts in the new group). */
export interface FgcIssuer {
    readonly name: string;
    readonly groupId: string;
    readonly groupName: string;
    readonly kind: string;
    readonly fgcAssociated: boolean;
}

export interface FgcHolding {
    readonly id: string;
    readonly name: string;
    /** Kind of the security (cdb, lci, ...); null for a Tesouro Direto position. */
    readonly kind: string | null;
    readonly currency: string;
    readonly valueMinor: number;
    readonly estimated: boolean;
    readonly matured: boolean;
    readonly treasury: boolean;
    readonly holderUserId: string | null;
    readonly issuer: FgcIssuer | null;
}

export interface FgcGroupTitle {
    readonly id: string;
    readonly name: string;
    readonly issuerName: string;
    readonly kind: string;
    readonly valueMinor: number;
    readonly estimated: boolean;
}

export interface FgcGroup {
    readonly groupId: string;
    readonly groupName: string;
    readonly totalMinor: number;
    readonly coveredMinor: number;
    readonly overMinor: number;
    readonly titles: readonly FgcGroupTitle[];
}

export interface FgcOutside {
    readonly id: string;
    readonly name: string;
    readonly reason: OutsideReason;
    readonly valueMinor: number;
}

export interface FgcHolderBlock {
    readonly holderUserId: string | null;
    readonly coveredMinor: number;
    readonly capShareBps: number;
    readonly groups: readonly FgcGroup[];
    readonly outside: readonly FgcOutside[];
}

export interface FgcCoverage {
    readonly asOf: string;
    readonly blocks: readonly FgcHolderBlock[];
}

export interface FgcSimulationInput {
    readonly issuerId: string;
    readonly kind: string;
    readonly valueMinor: number;
    readonly excludeTitleId?: string;
}

export interface FgcSimulation {
    readonly verdict: Verdict;
    readonly groupId: string;
    readonly groupName: string;
    readonly totalAfterMinor: number;
    readonly overMinor: number;
}
