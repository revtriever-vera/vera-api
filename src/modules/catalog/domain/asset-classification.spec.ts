import { describe, expect, it } from 'vitest';
import { AssetClassification, classifyAsset } from './asset-classification';
import { ASSET_KINDS, AssetKind, CatalogMarket, CLASS_KEYS, MARKETS, TYPE_GROUPS } from './catalog.types';

function classify(market: CatalogMarket, symbol: string, kind: AssetKind, externalId: string = symbol): AssetClassification | null {
    return classifyAsset(market, { externalId, symbol, kind });
}

describe('classifyAsset', () => {
    it('classifies a B3 stock as acoes_br without dollar exposure', () => {
        expect(classify(MARKETS.b3, 'ITUB4', ASSET_KINDS.stock)).toEqual({
            kind: 'stock',
            typeGroup: TYPE_GROUPS.acoesBr,
            suggestedClassKey: CLASS_KEYS.acoesBr,
            dollarExposure: false
        });
    });

    it('classifies a FII as fii', () => {
        expect(classify(MARKETS.b3, 'HGLG11', ASSET_KINDS.fii)).toMatchObject({
            typeGroup: 'fii',
            suggestedClassKey: 'fii',
            dollarExposure: false
        });
    });

    it('classifies IVVB11 by exposure: acoes_eua with dollar exposure, in the US stocks group', () => {
        expect(classify(MARKETS.b3, 'IVVB11', ASSET_KINDS.etf)).toEqual({
            kind: 'etf',
            typeGroup: 'acoes_eua',
            suggestedClassKey: 'acoes_eua',
            dollarExposure: true
        });
    });

    it('trusts the curated map even when the source mislabels the kind', () => {
        expect(classify(MARKETS.b3, 'IVVB11', ASSET_KINDS.fii)).toMatchObject({ kind: 'etf', suggestedClassKey: 'acoes_eua' });
    });

    it('classifies a BDR as acoes_eua with dollar exposure', () => {
        expect(classify(MARKETS.b3, 'AAPL34', ASSET_KINDS.bdr)).toEqual({
            kind: 'bdr',
            typeGroup: 'acoes_eua',
            suggestedClassKey: 'acoes_eua',
            dollarExposure: true
        });
    });

    it('classifies curated Brazilian equity, fixed income and crypto ETFs by their exposure', () => {
        expect(classify(MARKETS.b3, 'BOVA11', ASSET_KINDS.etf)).toMatchObject({ typeGroup: 'acoes_br', suggestedClassKey: 'acoes_br' });
        expect(classify(MARKETS.b3, 'IMAB11', ASSET_KINDS.etf)).toMatchObject({ typeGroup: 'acoes_br', suggestedClassKey: 'rf_ipca' });
        expect(classify(MARKETS.b3, 'IRFM11', ASSET_KINDS.etf)).toMatchObject({ suggestedClassKey: 'rf_pre' });
        expect(classify(MARKETS.b3, 'LFTS11', ASSET_KINDS.etf)).toMatchObject({ suggestedClassKey: 'rf_pos' });
        expect(classify(MARKETS.b3, 'HASH11', ASSET_KINDS.etf)).toMatchObject({ typeGroup: 'cripto', suggestedClassKey: 'cripto' });
    });

    it('leaves an ETF outside the map without class and in acoes_br', () => {
        expect(classify(MARKETS.b3, 'ZZZZ11', ASSET_KINDS.etf)).toEqual({
            kind: 'etf',
            typeGroup: 'acoes_br',
            suggestedClassKey: null,
            dollarExposure: false
        });
    });

    it('keeps a mapped ETF with a null class (gold) without class', () => {
        expect(classify(MARKETS.b3, 'GOLD11', ASSET_KINDS.etf)).toMatchObject({ suggestedClassKey: null, typeGroup: 'acoes_br' });
    });

    it('drops B3 kinds that are not stock, FII, ETF or BDR', () => {
        expect(classify(MARKETS.b3, 'XXXX1', ASSET_KINDS.crypto)).toBeNull();
        expect(classify(MARKETS.b3, 'XXXX2', ASSET_KINDS.reit)).toBeNull();
    });

    it('classifies US stocks, ADRs and ETFs as acoes_eua', () => {
        expect(classify(MARKETS.us, 'VOO', ASSET_KINDS.etf)).toEqual({
            kind: 'etf',
            typeGroup: 'acoes_eua',
            suggestedClassKey: 'acoes_eua',
            dollarExposure: true
        });
        expect(classify(MARKETS.us, 'AAPL', ASSET_KINDS.stock)).toMatchObject({ suggestedClassKey: 'acoes_eua' });
    });

    it('classifies symbols of the REIT map as reits whatever the source kind', () => {
        expect(classify(MARKETS.us, 'VNQ', ASSET_KINDS.etf)).toEqual({
            kind: 'reit',
            typeGroup: 'reits',
            suggestedClassKey: 'reits',
            dollarExposure: true
        });
        expect(classify(MARKETS.us, 'O', ASSET_KINDS.stock)).toMatchObject({ typeGroup: 'reits' });
    });

    it('classifies a source-declared REIT outside the map as reits', () => {
        expect(classify(MARKETS.us, 'ZZZ', ASSET_KINDS.reit)).toMatchObject({ typeGroup: 'reits', suggestedClassKey: 'reits' });
    });

    it('drops US kinds outside stock, ETF and REIT', () => {
        expect(classify(MARKETS.us, 'BBB', ASSET_KINDS.fii)).toBeNull();
    });

    it('classifies crypto as cripto and drops anything else in the crypto market', () => {
        expect(classify(MARKETS.crypto, 'BTC', ASSET_KINDS.crypto, 'bitcoin')).toEqual({
            kind: 'crypto',
            typeGroup: 'cripto',
            suggestedClassKey: 'cripto',
            dollarExposure: false
        });
        expect(classify(MARKETS.crypto, 'X', ASSET_KINDS.stock)).toBeNull();
    });

    it.each([
        ['selic:2029-03-01', 'rf_pos'],
        ['prefixado:2029-01-01', 'rf_pre'],
        ['prefixado-juros-semestrais:2033-01-01', 'rf_pre'],
        ['ipca:2035-05-15', 'rf_ipca'],
        ['ipca-juros-semestrais:2040-08-15', 'rf_ipca'],
        ['renda-mais:2049-12-15', 'rf_ipca'],
        ['educa-mais:2038-12-15', 'rf_ipca']
    ])('classifies the treasury bond %s as %s', (externalId: string, classKey: string) => {
        expect(classify(MARKETS.tesouro, 'Tesouro', ASSET_KINDS.treasury, externalId)).toEqual({
            kind: 'treasury',
            typeGroup: 'tesouro',
            suggestedClassKey: classKey,
            dollarExposure: false
        });
    });

    it('drops an unknown treasury type and non-treasury kinds in the Tesouro market', () => {
        expect(classify(MARKETS.tesouro, 'Tesouro', ASSET_KINDS.treasury, 'desconhecido:2030-01-01')).toBeNull();
        expect(classify(MARKETS.tesouro, 'X', ASSET_KINDS.stock, 'selic:2029-03-01')).toBeNull();
    });
});
