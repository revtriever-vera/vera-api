import { describe, expect, it } from 'vitest';
import { SourceAsset } from '../ports/asset-source.port';
import { buildAssetWrites, popularRankOf } from './asset-snapshot';
import { AssetWrite } from './catalog.types';

function source(symbol: string, kind: SourceAsset['kind'], overrides: Partial<SourceAsset> = {}): SourceAsset {
    return { externalId: symbol, symbol, name: `${symbol} name`, kind, currency: 'brl', raw: {}, ...overrides };
}

describe('buildAssetWrites', () => {
    it('classifies, applies market attributes and drops what classification excludes', () => {
        const writes: AssetWrite[] = buildAssetWrites('B3', [source('IVVB11', 'etf'), source('XXXX1', 'crypto')]);

        expect(writes).toHaveLength(1);
        expect(writes[0]).toMatchObject({
            market: 'B3',
            externalId: 'IVVB11',
            typeGroup: 'acoes_eua',
            suggestedClassKey: 'acoes_eua',
            dollarExposure: true,
            currency: 'BRL',
            quotesProvider: 'brapi',
            quantityDecimals: 0,
            maturityDate: null,
            rank: null
        });
    });

    it('keeps the last occurrence of a duplicated external id', () => {
        const writes: AssetWrite[] = buildAssetWrites('B3', [source('ITUB4', 'stock'), source('ITUB4', 'stock', { name: 'Itau novo' })]);

        expect(writes).toHaveLength(1);
        expect(writes[0]?.name).toBe('Itau novo');
    });

    it('produces a stable hash that changes with any field', () => {
        const first: AssetWrite | undefined = buildAssetWrites('B3', [source('ITUB4', 'stock')])[0];
        const same: AssetWrite | undefined = buildAssetWrites('B3', [source('ITUB4', 'stock')])[0];
        const renamed: AssetWrite | undefined = buildAssetWrites('B3', [source('ITUB4', 'stock', { name: 'Outro' })])[0];

        expect(first?.sourceHash).toBe(same?.sourceHash);
        expect(first?.sourceHash).not.toBe(renamed?.sourceHash);
    });

    it('uses the market attributes for decimals and quotes provider', () => {
        const us: AssetWrite | undefined = buildAssetWrites('US', [source('VOO', 'etf', { currency: 'USD' })])[0];
        const crypto: AssetWrite | undefined = buildAssetWrites('CRYPTO', [
            source('bitcoin', 'crypto', { symbol: 'BTC', currency: 'USD', rank: 1 })
        ])[0];
        const tesouro: AssetWrite | undefined = buildAssetWrites('TESOURO', [
            source('selic:2029-03-01', 'treasury', { symbol: 'Tesouro Selic 2029', maturityDate: '2029-03-01' })
        ])[0];

        expect([us?.quantityDecimals, us?.quotesProvider]).toEqual([6, 'us_equities']);
        expect([crypto?.quantityDecimals, crypto?.quotesProvider, crypto?.rank]).toEqual([8, 'coingecko', 1]);
        expect([tesouro?.quantityDecimals, tesouro?.quotesProvider, tesouro?.maturityDate]).toEqual([2, 'tesouro', '2029-03-01']);
    });

    it('sets the popular rank from the curated list of the asset group', () => {
        expect(popularRankOf('acoes_eua', 'B3', 'IVVB11')).toBe(1);
        expect(popularRankOf('acoes_br', 'B3', 'IVVB11')).toBeNull();
        expect(buildAssetWrites('B3', [source('IVVB11', 'etf')])[0]?.popularRank).toBe(1);
        expect(buildAssetWrites('B3', [source('ZZZZ3', 'stock')])[0]?.popularRank).toBeNull();
    });
});
