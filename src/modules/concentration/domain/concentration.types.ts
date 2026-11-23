export const ISSUER_BUCKETS = {
    missingIssuer: 'missing_issuer',
    funds: 'funds',
    crypto: 'crypto',
    unmapped: 'unmapped'
} as const;

export type IssuerBucket = (typeof ISSUER_BUCKETS)[keyof typeof ISSUER_BUCKETS];

export const UNMAPPED_SECTOR: string = 'unmapped_sector';
export const SOVEREIGN_BR_GROUP: string = 'tesouro-nacional';
export const TOP_ISSUERS_LIMIT: number = 10;
export const ASSET_NAMES_LIMIT: number = 4;

export const ISSUER_ROW_KINDS = {
    group: 'group',
    bucket: 'bucket'
} as const;

export type IssuerRowKind = (typeof ISSUER_ROW_KINDS)[keyof typeof ISSUER_ROW_KINDS];

export const UNMAPPED_DIMENSIONS = {
    issuer: 'issuer',
    sector: 'sector'
} as const;

export type UnmappedDimension = (typeof UNMAPPED_DIMENSIONS)[keyof typeof UNMAPPED_DIMENSIONS];

export interface HoldingInput {
    readonly kind: 'position' | 'fixed_income';
    readonly symbol: string;
    readonly typeGroup: string;
    readonly classId: string | null;
    readonly assetKind: string | null;
    readonly sector: string | null;
    readonly issuerGroupId: string | null;
    readonly valueMinor: number;
    readonly isZeroQuantity: boolean;
    readonly matured: boolean;
}

export interface ClassInput {
    readonly classId: string;
    readonly systemKey: string | null;
}

export interface IssuerKey {
    readonly key: string;
    readonly kind: IssuerRowKind;
}

export interface ConcentrationRow {
    readonly key: string;
    readonly valueMinor: number;
    readonly shareBps: number;
    readonly assets: readonly string[];
    readonly moreCount: number;
}

export interface IssuerRow extends ConcentrationRow {
    readonly kind: IssuerRowKind;
    readonly name: string | null;
}

export interface IssuerOthers {
    readonly valueMinor: number;
    readonly shareBps: number;
    readonly groups: number;
}

export interface Concentration {
    readonly totalMinor: number;
    readonly equityTotalMinor: number;
    readonly byIssuer: readonly IssuerRow[];
    readonly byIssuerOthers: IssuerOthers | null;
    readonly bySector: readonly ConcentrationRow[];
    readonly unmappedHoldings: number;
    readonly unmappedIssuerRatio: number;
    readonly unmappedSectorRatio: number;
}
