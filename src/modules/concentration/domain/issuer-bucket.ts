import { HoldingInput, ISSUER_BUCKETS, ISSUER_ROW_KINDS, IssuerKey, SOVEREIGN_BR_GROUP } from './concentration.types';

const TESOURO_TYPE_GROUP: string = 'tesouro';
const CRYPTO_TYPE_GROUP: string = 'cripto';
const FUND_ASSET_KINDS: ReadonlySet<string> = new Set<string>(['etf', 'fii', 'reit']);
const FIXED_INCOME_KIND: HoldingInput['kind'] = 'fixed_income';

function groupKey(key: string): IssuerKey {
    return { key, kind: ISSUER_ROW_KINDS.group };
}

function bucketKey(key: string): IssuerKey {
    return { key, kind: ISSUER_ROW_KINDS.bucket };
}

function titleKeyOf(holding: HoldingInput): IssuerKey {
    return holding.issuerGroupId === null ? bucketKey(ISSUER_BUCKETS.missingIssuer) : groupKey(holding.issuerGroupId);
}

function positionKeyOf(holding: HoldingInput): IssuerKey {
    if (holding.typeGroup === TESOURO_TYPE_GROUP) {
        return groupKey(SOVEREIGN_BR_GROUP);
    }
    if (holding.typeGroup === CRYPTO_TYPE_GROUP) {
        return bucketKey(ISSUER_BUCKETS.crypto);
    }
    if (holding.issuerGroupId !== null) {
        return groupKey(holding.issuerGroupId);
    }
    return bucketKey(
        holding.assetKind !== null && FUND_ASSET_KINDS.has(holding.assetKind) ? ISSUER_BUCKETS.funds : ISSUER_BUCKETS.unmapped
    );
}

export function issuerKeyOf(holding: HoldingInput): IssuerKey {
    return holding.kind === FIXED_INCOME_KIND ? titleKeyOf(holding) : positionKeyOf(holding);
}

export function isUnmappedIssuerKey(key: string): boolean {
    return key === ISSUER_BUCKETS.missingIssuer || key === ISSUER_BUCKETS.unmapped;
}
