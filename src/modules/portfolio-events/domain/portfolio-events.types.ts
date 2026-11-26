import { Insertable, Selectable } from 'kysely';
import { AssetIssuerLinks, PortfolioEvents } from '../../../core/database/generated/database.types';

export const ISSUER_KINDS = { company: 'company', fund: 'fund' } as const;
export type IssuerKind = (typeof ISSUER_KINDS)[keyof typeof ISSUER_KINDS];

export const EVENT_KINDS = {
    dividend: 'dividend',
    jcp: 'jcp',
    fiiIncome: 'fii_income',
    amortization: 'amortization',
    assembly: 'assembly',
    earningsRelease: 'earnings_release'
} as const;
export type EventKind = (typeof EVENT_KINDS)[keyof typeof EVENT_KINDS];

export const EVENT_SOURCES = { fnet: 'fnet' } as const;
export type EventSource = (typeof EVENT_SOURCES)[keyof typeof EVENT_SOURCES];

export type AssetIssuerLinkRow = Selectable<AssetIssuerLinks>;
export type AssetIssuerLinkWrite = Pick<Insertable<AssetIssuerLinks>, 'assetId' | 'issuerKind' | 'cnpj' | 'cvmCode' | 'source'>;

export type PortfolioEventRow = Selectable<PortfolioEvents>;

export interface PortfolioEventDraft {
    readonly kind: EventKind;
    readonly exDate: string | null;
    readonly paymentDate: string | null;
    readonly eventDate: string | null;
    readonly amountPerUnit: string | null;
    readonly currency: string;
    readonly externalKey: string;
    readonly documentUrl: string | null;
}

export interface PortfolioEventWrite extends PortfolioEventDraft {
    readonly assetId: string;
    readonly source: EventSource;
}

export interface PortfolioEventView extends PortfolioEventWrite {
    readonly id: string;
}

export interface EventWindow {
    readonly from: string;
    readonly to: string;
}

export interface IssuerLink {
    readonly assetId: string;
    readonly issuerKind: IssuerKind;
    readonly cnpj: string;
}

export const CNPJ_PATTERN: RegExp = /^\d{14}$/;
