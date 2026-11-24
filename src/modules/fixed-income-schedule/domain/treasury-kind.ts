import { TREASURY_KINDS, TreasuryKind } from './schedule.types';

const TESOURO_MARKET: string = 'TESOURO';
const TREASURY_ASSET_KIND: string = 'treasury';
const UNSUPPORTED_PREFIXES: readonly string[] = ['prefixado-juros', 'ipca-juros', 'igpm-juros', 'renda-mais', 'educa-mais'];

const KIND_BY_CLASS_KEY: Readonly<Record<string, TreasuryKind>> = {
    rf_pos: TREASURY_KINDS.selic,
    rf_pre: TREASURY_KINDS.prefixed,
    rf_ipca: TREASURY_KINDS.ipca
};

export interface TreasuryAsset {
    readonly market: string;
    readonly kind: string;
    readonly externalId: string;
    readonly suggestedClassKey: string | null;
    readonly maturityDate: string | null;
}

export function treasuryKindOf(asset: TreasuryAsset): TreasuryKind | null {
    if (asset.market !== TESOURO_MARKET || asset.kind !== TREASURY_ASSET_KIND || asset.maturityDate === null) {
        return null;
    }
    if (UNSUPPORTED_PREFIXES.some((prefix: string): boolean => asset.externalId.startsWith(prefix))) {
        return null;
    }
    return asset.suggestedClassKey === null ? null : (KIND_BY_CLASS_KEY[asset.suggestedClassKey] ?? null);
}
