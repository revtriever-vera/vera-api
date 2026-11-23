import { ISSUER_KINDS, Issuer, IssuerKind, SOVEREIGN_ISSUER_IDS } from './issuer.types';

const BANK_TITLE_KINDS: ReadonlySet<string> = new Set(['cdb', 'lci', 'lca', 'lc']);
const COMPANY_TITLE_KINDS: ReadonlySet<string> = new Set(['debenture', 'cri', 'cra']);
const USD_CURRENCY: string = 'USD';

export function issuerKindOfTitle(titleKind: string): IssuerKind | null {
    if (BANK_TITLE_KINDS.has(titleKind)) {
        return ISSUER_KINDS.bank;
    }
    return COMPANY_TITLE_KINDS.has(titleKind) ? ISSUER_KINDS.company : null;
}

function acceptedInUsd(issuer: Issuer): boolean {
    return issuer.kind === ISSUER_KINDS.company || issuer.id === SOVEREIGN_ISSUER_IDS.unitedStates;
}

export function issuerFitsTitle(issuer: Issuer, titleKind: string, currency: string): boolean {
    if (issuer.kind === ISSUER_KINDS.other) {
        return true;
    }
    if (currency === USD_CURRENCY && acceptedInUsd(issuer)) {
        return true;
    }
    return issuerKindOfTitle(titleKind) === issuer.kind;
}
