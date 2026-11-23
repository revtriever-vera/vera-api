import { describe, expect, it } from 'vitest';
import { makePrototypeSnapshot } from '../../../../test/support/portfolio-fixtures';
import { buildConcentration, ConcentrationInput } from './concentration';
import { ClassInput, Concentration, HoldingInput, IssuerRow } from './concentration.types';

const CLASSES: readonly ClassInput[] = [
    { classId: 'c-rf', systemKey: 'rf_pos' },
    { classId: 'c-br', systemKey: 'acoes_br' },
    { classId: 'c-fii', systemKey: 'fii' },
    { classId: 'c-eua', systemKey: 'acoes_eua' },
    { classId: 'c-crypto', systemKey: 'cripto' },
    { classId: 'c-custom', systemKey: null }
];

const GROUP_NAMES: Readonly<Record<string, string>> = {
    'itau-unibanco': 'Itaú Unibanco',
    'btg-pactual': 'BTG Pactual',
    'tesouro-nacional': 'Tesouro Nacional',
    'tesouro-eua': 'Tesouro dos EUA'
};

function holding(overrides: Partial<HoldingInput>): HoldingInput {
    return {
        kind: 'position',
        symbol: 'ASSET',
        typeGroup: 'acoes_br',
        classId: 'c-br',
        assetKind: 'stock',
        sector: null,
        issuerGroupId: null,
        valueMinor: 1_000,
        isZeroQuantity: false,
        matured: false,
        ...overrides
    };
}

function title(overrides: Partial<HoldingInput>): HoldingInput {
    return holding({ kind: 'fixed_income', typeGroup: 'fixed_income', classId: 'c-rf', assetKind: null, ...overrides });
}

function run(holdings: readonly HoldingInput[]): Concentration {
    const input: ConcentrationInput = { holdings, classes: CLASSES, groupName: (id: string): string | null => GROUP_NAMES[id] ?? null };
    return buildConcentration(input);
}

function rowOf(result: Concentration, key: string): IssuerRow {
    return result.byIssuer.find((row: IssuerRow): boolean => row.key === key) as IssuerRow;
}

describe('buildConcentration by issuer', () => {
    it('sums a bank security and a stock of the same group', () => {
        const result = run([
            title({ symbol: 'LCI Itau', issuerGroupId: 'itau-unibanco', valueMinor: 4_000 }),
            holding({ symbol: 'ITUB4', issuerGroupId: 'itau-unibanco', sector: 'financeiro', valueMinor: 1_000 }),
            holding({ symbol: 'WEGE3', issuerGroupId: 'weg', valueMinor: 5_000 })
        ]);

        expect(rowOf(result, 'itau-unibanco')).toMatchObject({
            kind: 'group',
            name: 'Itaú Unibanco',
            valueMinor: 5_000,
            shareBps: 5_000,
            assets: ['LCI Itau', 'ITUB4'],
            moreCount: 0
        });
    });

    it('counts a security of an incorporated bank in the group the application resolved', () => {
        const result = run([
            title({ symbol: 'CDB Pan', issuerGroupId: 'btg-pactual', valueMinor: 3_000 }),
            holding({ symbol: 'BPAC11', issuerGroupId: 'btg-pactual', valueMinor: 1_000 })
        ]);

        expect(result.byIssuer).toHaveLength(1);
        expect(result.byIssuer[0]).toMatchObject({ key: 'btg-pactual', valueMinor: 4_000, shareBps: 10_000 });
    });

    it('puts Tesouro Direto and a Treasury title in the sovereign groups', () => {
        const result = run([
            holding({ symbol: 'TESOURO-SELIC-2029', typeGroup: 'tesouro', assetKind: 'treasury', valueMinor: 2_000 }),
            title({ symbol: 'Treasury 2027', issuerGroupId: 'tesouro-eua', valueMinor: 1_000 })
        ]);

        expect(rowOf(result, 'tesouro-nacional')).toMatchObject({ kind: 'group', name: 'Tesouro Nacional' });
        expect(rowOf(result, 'tesouro-eua')).toMatchObject({ kind: 'group', name: 'Tesouro dos EUA' });
    });

    it('sends the holdings without a single issuer to the fixed buckets', () => {
        const result = run([
            title({ symbol: 'CDB sem emissor', valueMinor: 100 }),
            holding({ symbol: 'BOVA11', assetKind: 'etf', valueMinor: 200 }),
            holding({ symbol: 'HGLG11', typeGroup: 'fii', assetKind: 'fii', classId: 'c-fii', valueMinor: 300 }),
            holding({ symbol: 'VNQ', typeGroup: 'reits', assetKind: 'reit', valueMinor: 400 }),
            holding({ symbol: 'BTC', typeGroup: 'cripto', assetKind: 'crypto', classId: 'c-crypto', valueMinor: 500 }),
            holding({ symbol: 'XPTO3', valueMinor: 600 })
        ]);

        expect(rowOf(result, 'missing_issuer')).toMatchObject({ kind: 'bucket', name: null, valueMinor: 100 });
        expect(rowOf(result, 'funds')).toMatchObject({ kind: 'bucket', valueMinor: 900, assets: ['VNQ', 'HGLG11', 'BOVA11'] });
        expect(rowOf(result, 'crypto')).toMatchObject({ kind: 'bucket', valueMinor: 500 });
        expect(rowOf(result, 'unmapped')).toMatchObject({ kind: 'bucket', valueMinor: 600 });
        expect(result.unmappedHoldings).toBe(2);
        expect(result.unmappedIssuerRatio).toBeCloseTo(700 / 2_100);
    });

    it('keeps the FII that has an issuer group in its group', () => {
        const result = run([
            holding({ symbol: 'ITUB4', issuerGroupId: 'itau-unibanco' }),
            holding({ symbol: 'HGLG11', assetKind: 'fii', issuerGroupId: 'itau-unibanco' })
        ]);

        expect(result.byIssuer).toHaveLength(1);
    });

    it('shows the top 10 and sums the rest in others with exact shares', () => {
        const holdings: HoldingInput[] = Array.from({ length: 13 }, (_: unknown, index: number): HoldingInput =>
            holding({ symbol: `A${String(index)}`, issuerGroupId: `g${String(index).padStart(2, '0')}`, valueMinor: 1_000 + index })
        );

        const result = run(holdings);

        expect(result.byIssuer).toHaveLength(10);
        expect(result.byIssuer[0]?.key).toBe('g12');
        expect(result.byIssuerOthers).toMatchObject({ groups: 3, valueMinor: 1_000 + 1_001 + 1_002 });
        const sum: number = result.byIssuer.reduce((total: number, row: IssuerRow): number => total + row.shareBps, 0);
        expect(sum + (result.byIssuerOthers?.shareBps ?? 0)).toBe(10_000);
        expect(result.byIssuer[0]?.name).toBe('g12');
    });

    it('has no others when there are 10 rows or fewer', () => {
        expect(run([holding({ issuerGroupId: 'g1' })]).byIssuerOthers).toBeNull();
    });

    it('lists up to 4 asset names and counts the rest', () => {
        const holdings: HoldingInput[] = Array.from({ length: 6 }, (_: unknown, index: number): HoldingInput =>
            holding({ symbol: `T${String(index)}`, issuerGroupId: 'g1', valueMinor: 100 - index })
        );

        const row = run(holdings).byIssuer[0] as IssuerRow;

        expect(row.assets).toEqual(['T0', 'T1', 'T2', 'T3']);
        expect(row.moreCount).toBe(2);
    });

    it('leaves out zeroed positions and matured securities', () => {
        const result = run([
            holding({ symbol: 'ZERO', isZeroQuantity: true, valueMinor: 0, issuerGroupId: 'g1' }),
            title({ symbol: 'VENCIDO', matured: true, issuerGroupId: 'g2', valueMinor: 900 }),
            holding({ symbol: 'OK', issuerGroupId: 'g3', valueMinor: 100 })
        ]);

        expect(result.byIssuer.map((row: IssuerRow): string => row.key)).toEqual(['g3']);
        expect(result.totalMinor).toBe(100);
    });

    it('returns empty lists for an empty portfolio', () => {
        expect(run([])).toMatchObject({ totalMinor: 0, equityTotalMinor: 0, byIssuer: [], byIssuerOthers: null, bySector: [] });
    });
});

describe('buildConcentration by sector', () => {
    it('counts only the equity classes and measures the share over them', () => {
        const result = run([
            title({ symbol: 'CDB', valueMinor: 9_000 }),
            holding({ symbol: 'ITUB4', sector: 'financeiro', valueMinor: 3_000 }),
            holding({ symbol: 'BBAS3', sector: 'financeiro', valueMinor: 1_000 }),
            holding({ symbol: 'HGLG11', typeGroup: 'fii', classId: 'c-fii', sector: 'imobiliario_logistica', valueMinor: 1_000 }),
            holding({ symbol: 'BTC', typeGroup: 'cripto', classId: 'c-crypto', valueMinor: 7_000 })
        ]);

        expect(result.equityTotalMinor).toBe(5_000);
        expect(result.bySector).toEqual([
            { key: 'financeiro', valueMinor: 4_000, shareBps: 8_000, assets: ['ITUB4', 'BBAS3'], moreCount: 0 },
            { key: 'imobiliario_logistica', valueMinor: 1_000, shareBps: 2_000, assets: ['HGLG11'], moreCount: 0 }
        ]);
    });

    it('flags the equity asset without a sector and keeps the index ETF as a sector', () => {
        const result = run([
            holding({ symbol: 'XPTO3', sector: null, valueMinor: 1_000 }),
            holding({ symbol: 'BOVA11', assetKind: 'etf', sector: 'etf_indice', valueMinor: 1_000 })
        ]);

        expect(result.bySector.map((row) => row.key).sort()).toEqual(['etf_indice', 'unmapped_sector']);
        expect(result.unmappedSectorRatio).toBeCloseTo(0.5);
    });

    it('uses the type group when the class is custom', () => {
        const result = run([
            holding({ symbol: 'ITUB4', classId: 'c-custom', sector: 'financeiro' }),
            holding({ symbol: 'BTC', classId: 'c-custom', typeGroup: 'cripto', sector: null })
        ]);

        expect(result.bySector.map((row) => row.key)).toEqual(['financeiro']);
    });

    it('uses the type group when the holding has no class', () => {
        expect(run([holding({ classId: null, sector: 'saude' })]).bySector).toHaveLength(1);
    });
});

describe('buildConcentration over the portfolio snapshot', () => {
    it('keeps exact shares in USD base', () => {
        const snapshot = makePrototypeSnapshot({ baseCurrency: 'USD' });

        const result = run(snapshot.holdings);

        expect(result.totalMinor).toBe(snapshot.totalMinor);
        const sum: number = result.byIssuer.reduce((total: number, row: IssuerRow): number => total + row.shareBps, 0);
        expect(sum + (result.byIssuerOthers?.shareBps ?? 0)).toBe(10_000);
        expect(rowOf(result, 'tesouro-nacional')).toBeDefined();
        expect(rowOf(result, 'crypto').assets).toEqual(['BTC', 'ETH']);
    });
});
