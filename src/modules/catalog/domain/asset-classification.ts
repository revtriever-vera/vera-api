import { B3_ETF_MAP, US_REIT_MAP } from './curated-maps';
import { ASSET_KINDS, AssetKind, CatalogMarket, CLASS_KEYS, ClassKey, MARKETS, TYPE_GROUPS, TypeGroup } from './catalog.types';
import { CuratedEntry } from '../validation/curated-maps.schemas';

export interface ClassifiableAsset {
    readonly externalId: string;
    readonly symbol: string;
    readonly kind: AssetKind;
}

export interface AssetClassification {
    readonly kind: AssetKind;
    readonly typeGroup: TypeGroup;
    readonly suggestedClassKey: ClassKey | null;
    readonly dollarExposure: boolean;
}

type Classifier = (asset: ClassifiableAsset) => AssetClassification | null;

const TREASURY_CLASS_BY_SLUG: Readonly<Record<string, ClassKey>> = {
    selic: CLASS_KEYS.rfPos,
    prefixado: CLASS_KEYS.rfPre,
    'prefixado-juros-semestrais': CLASS_KEYS.rfPre,
    ipca: CLASS_KEYS.rfIpca,
    'ipca-juros-semestrais': CLASS_KEYS.rfIpca,
    'renda-mais': CLASS_KEYS.rfIpca,
    'educa-mais': CLASS_KEYS.rfIpca
};

const GROUP_BY_CURATED_CLASS: Readonly<Record<ClassKey, TypeGroup>> = {
    rf_pos: TYPE_GROUPS.acoesBr,
    rf_pre: TYPE_GROUPS.acoesBr,
    rf_ipca: TYPE_GROUPS.acoesBr,
    acoes_br: TYPE_GROUPS.acoesBr,
    fii: TYPE_GROUPS.fii,
    acoes_eua: TYPE_GROUPS.acoesEua,
    reits: TYPE_GROUPS.reits,
    cripto: TYPE_GROUPS.cripto
};

function fromCuratedEtf(entry: CuratedEntry): AssetClassification {
    return {
        kind: ASSET_KINDS.etf,
        typeGroup: entry.classKey === null ? TYPE_GROUPS.acoesBr : GROUP_BY_CURATED_CLASS[entry.classKey],
        suggestedClassKey: entry.classKey,
        dollarExposure: entry.dollarExposure
    };
}

function reitClassification(): AssetClassification {
    return { kind: ASSET_KINDS.reit, typeGroup: TYPE_GROUPS.reits, suggestedClassKey: CLASS_KEYS.reits, dollarExposure: true };
}

const B3_BY_KIND: Readonly<Partial<Record<AssetKind, AssetClassification>>> = {
    stock: { kind: ASSET_KINDS.stock, typeGroup: TYPE_GROUPS.acoesBr, suggestedClassKey: CLASS_KEYS.acoesBr, dollarExposure: false },
    fii: { kind: ASSET_KINDS.fii, typeGroup: TYPE_GROUPS.fii, suggestedClassKey: CLASS_KEYS.fii, dollarExposure: false },
    bdr: { kind: ASSET_KINDS.bdr, typeGroup: TYPE_GROUPS.acoesEua, suggestedClassKey: CLASS_KEYS.acoesEua, dollarExposure: true },
    etf: { kind: ASSET_KINDS.etf, typeGroup: TYPE_GROUPS.acoesBr, suggestedClassKey: null, dollarExposure: false }
};

const US_BY_KIND: Readonly<Partial<Record<AssetKind, AssetClassification>>> = {
    stock: { kind: ASSET_KINDS.stock, typeGroup: TYPE_GROUPS.acoesEua, suggestedClassKey: CLASS_KEYS.acoesEua, dollarExposure: true },
    etf: { kind: ASSET_KINDS.etf, typeGroup: TYPE_GROUPS.acoesEua, suggestedClassKey: CLASS_KEYS.acoesEua, dollarExposure: true }
};

const classifyB3: Classifier = (asset: ClassifiableAsset): AssetClassification | null => {
    const curated: CuratedEntry | undefined = B3_ETF_MAP.get(asset.symbol);
    if (curated) {
        return fromCuratedEtf(curated);
    }
    return B3_BY_KIND[asset.kind] ?? null;
};

const classifyUs: Classifier = (asset: ClassifiableAsset): AssetClassification | null => {
    if (US_REIT_MAP.has(asset.symbol) || asset.kind === ASSET_KINDS.reit) {
        return reitClassification();
    }
    return US_BY_KIND[asset.kind] ?? null;
};

const classifyCrypto: Classifier = (asset: ClassifiableAsset): AssetClassification | null => {
    if (asset.kind !== ASSET_KINDS.crypto) {
        return null;
    }
    return { kind: ASSET_KINDS.crypto, typeGroup: TYPE_GROUPS.cripto, suggestedClassKey: CLASS_KEYS.cripto, dollarExposure: false };
};

const classifyTesouro: Classifier = (asset: ClassifiableAsset): AssetClassification | null => {
    if (asset.kind !== ASSET_KINDS.treasury) {
        return null;
    }
    const slug: string = asset.externalId.split(':')[0] ?? '';
    const classKey: ClassKey | undefined = TREASURY_CLASS_BY_SLUG[slug];
    if (classKey === undefined) {
        return null;
    }
    return { kind: ASSET_KINDS.treasury, typeGroup: TYPE_GROUPS.tesouro, suggestedClassKey: classKey, dollarExposure: false };
};

const CLASSIFIERS: Readonly<Record<CatalogMarket, Classifier>> = {
    [MARKETS.b3]: classifyB3,
    [MARKETS.us]: classifyUs,
    [MARKETS.crypto]: classifyCrypto,
    [MARKETS.tesouro]: classifyTesouro
};

export function classifyAsset(market: CatalogMarket, asset: ClassifiableAsset): AssetClassification | null {
    return CLASSIFIERS[market](asset);
}
