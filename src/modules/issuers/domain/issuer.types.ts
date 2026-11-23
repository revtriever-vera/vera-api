export const ISSUER_KINDS = {
    bank: 'bank',
    company: 'company',
    sovereign: 'sovereign',
    other: 'other'
} as const;

export type IssuerKind = (typeof ISSUER_KINDS)[keyof typeof ISSUER_KINDS];

export const ISSUER_STATUSES = {
    active: 'active',
    retired: 'retired'
} as const;

export type IssuerStatus = (typeof ISSUER_STATUSES)[keyof typeof ISSUER_STATUSES];

export const SOVEREIGN_ISSUER_IDS = {
    brazil: 'tesouro-nacional',
    unitedStates: 'tesouro-eua'
} as const;

/** The "Outro emissor (sem cobertura calculada)" option: fits any security, is outside the FGC and has no real group. */
export const OTHER_ISSUER_ID: string = 'outro';

export const ISSUER_SEARCH_LIMIT: number = 20;
export const ISSUER_SEARCH_MAX_TEXT_LENGTH: number = 60;
export const ISSUER_SEARCH_LIMIT_PER_MINUTE: number = 120;
export const ISSUER_SEARCH_WINDOW_SECONDS: number = 60;

export interface Issuer {
    readonly id: string;
    readonly name: string;
    readonly groupId: string;
    readonly kind: IssuerKind;
    readonly fgcAssociated: boolean;
    readonly status: IssuerStatus;
    readonly mergedInto: string | null;
}

export interface IssuerRecord extends Issuer {
    readonly aliases: readonly string[];
}

export interface IssuerGroup {
    readonly id: string;
    readonly name: string;
}

export interface ResolvedIssuer extends Issuer {
    readonly groupName: string;
}
