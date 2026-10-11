import { describe, expect, it, vi } from 'vitest';
import { SourceAsset } from '../ports/asset-source.port';
import { TesouroBond, TesouroCsvReaderService, TesouroReadResult } from '../services/tesouro-csv-reader.service';
import { TesouroTitlesDriver } from './tesouro-titles.driver';

function bond(typeName: string, maturityDate: string, baseDate: string = '2026-10-08'): TesouroBond {
    return { typeName, maturityDate, baseDate, baseUnitPrice: '1.00', buyUnitPrice: null, sellUnitPrice: null };
}

function driverWith(result: TesouroReadResult): { driver: TesouroTitlesDriver; readLatest: ReturnType<typeof vi.fn> } {
    const readLatest: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(result);
    return { driver: new TesouroTitlesDriver({ readLatest } as unknown as TesouroCsvReaderService), readLatest };
}

describe('TesouroTitlesDriver', () => {
    it('builds stable external ids and display symbols from type and maturity', async () => {
        const { driver } = driverWith({
            changed: true,
            baseDate: '2026-10-08',
            bonds: [bond('Tesouro IPCA+', '2035-05-15'), bond('Tesouro Renda+ Aposentadoria Extra', '2049-12-15')]
        });

        const assets: readonly SourceAsset[] = await driver.fetchAll();

        expect(assets.map((asset: SourceAsset) => [asset.externalId, asset.symbol, asset.maturityDate])).toEqual([
            ['ipca:2035-05-15', 'Tesouro IPCA+ 2035', '2035-05-15'],
            ['renda-mais:2049-12-15', 'Tesouro Renda+ 2049', '2049-12-15']
        ]);
        expect(assets[0]).toMatchObject({ kind: 'treasury', currency: 'BRL' });
    });

    it('skips matured bonds and unknown types', async () => {
        const { driver } = driverWith({
            changed: true,
            baseDate: '2026-10-08',
            bonds: [
                bond('Tesouro Selic', '2026-10-08'),
                bond('Tesouro Selic', '2025-03-01'),
                bond('Tesouro IGPM+', '2031-07-15'),
                bond('Tesouro Selic', '2029-03-01')
            ]
        });

        const assets: readonly SourceAsset[] = await driver.fetchAll();

        expect(assets.map((asset: SourceAsset) => asset.externalId)).toEqual(['selic:2029-03-01']);
    });

    it('reads without conditional headers and returns nothing when the reader reports no change', async () => {
        const { driver, readLatest } = driverWith({ changed: false });

        expect(await driver.fetchAll()).toEqual([]);
        expect(readLatest).toHaveBeenCalledWith({ ignoreCache: true });
    });
});
