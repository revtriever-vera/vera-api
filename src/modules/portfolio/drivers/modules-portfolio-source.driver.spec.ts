import { describe, expect, it, vi } from 'vitest';
import { AssetCatalogService } from '../../catalog/services/asset-catalog.service';
import { FixedIncomeValuationService } from '../../fixed-income/services/fixed-income-valuation.service';
import { ExchangeRateReaderService } from '../../market-data/services/exchange-rate-reader.service';
import { QuoteReaderService } from '../../market-data/services/quote-reader.service';
import { PositionReaderService } from '../../positions/services/position-reader.service';
import { PortfolioClassInputsService } from '../services/portfolio-class-inputs.service';
import { ModulesPortfolioSourceDriver } from './modules-portfolio-source.driver';

const CLASS_INPUTS = {
    baseCurrency: 'BRL',
    toleranceBps: 500,
    classes: [{ id: 'c1', systemKey: 'acoes_br', name: null, displayName: 'Ações Brasil', colorKey: 'c4', targetBps: 1500, sortOrder: 4 }],
    assignments: [{ subjectType: 'position', subjectId: 'p1', classId: 'c1', targetInClassBps: 0 }]
};

const ASSET = {
    id: 'a1',
    symbol: 'ITUB4',
    name: 'Itaú',
    market: 'B3',
    typeGroup: 'acoes_br',
    currency: 'BRL',
    quantityDecimals: 0,
    dollarExposure: false
};

function driverWith(
    positions: readonly unknown[],
    valued: readonly unknown[] = []
): {
    driver: ModulesPortfolioSourceDriver;
    catalog: { findManyByIds: ReturnType<typeof vi.fn> };
    quotes: { getLatest: ReturnType<typeof vi.fn> };
} {
    const catalog = { findManyByIds: vi.fn().mockResolvedValue([{ ...ASSET, externalId: 'ITUB4' }]) };
    const quotes = {
        getLatest: vi
            .fn()
            .mockResolvedValue(
                new Map([['a1', { assetId: 'a1', price: '37.8', currency: 'BRL', priceDate: '2026-10-09', source: 'brapi', stale: false }]])
            )
    };
    const driver: ModulesPortfolioSourceDriver = new ModulesPortfolioSourceDriver(
        { listForCompany: vi.fn().mockResolvedValue(positions) } as unknown as PositionReaderService,
        { valueAll: vi.fn().mockResolvedValue(valued) } as unknown as FixedIncomeValuationService,
        catalog as unknown as AssetCatalogService,
        quotes as unknown as QuoteReaderService,
        {
            latest: vi.fn().mockResolvedValue({ currency: 'USD', brlPerUnit: '5.42', date: '2026-10-09', source: 'bcb-ptax' })
        } as unknown as ExchangeRateReaderService,
        { load: vi.fn().mockResolvedValue(CLASS_INPUTS) } as unknown as PortfolioClassInputsService
    );
    return { driver, catalog, quotes };
}

describe('ModulesPortfolioSourceDriver', () => {
    it('gathers positions, assets, quotes, titles, classes and the PTAX in one load', async () => {
        const { driver, catalog, quotes } = driverWith(
            [{ id: 'p1', assetId: 'a1', quantity: '2000.0000000000' }],
            [
                {
                    title: { id: 't1', name: 'CDB' },
                    valuation: {
                        status: 'index_data_missing',
                        valueMinor: 100,
                        currency: 'BRL',
                        estimated: false,
                        matured: false,
                        source: 'curve_cdi',
                        asOf: '2026-10-11'
                    }
                }
            ]
        );

        const data = await driver.load();

        expect(data.positions).toEqual([{ id: 'p1', assetId: 'a1', quantity: '2000' }]);
        expect(data.assets).toEqual([ASSET]);
        expect(data.quotes).toEqual([
            { assetId: 'a1', price: '37.8', currency: 'BRL', priceDate: '2026-10-09', source: 'brapi', stale: false }
        ]);
        expect(data.titles).toEqual([
            {
                id: 't1',
                name: 'CDB',
                indexDataMissing: true,
                valueMinor: 100,
                currency: 'BRL',
                estimated: false,
                matured: false,
                source: 'curve_cdi',
                asOf: '2026-10-11'
            }
        ]);
        expect(data).toMatchObject({
            baseCurrency: 'BRL',
            toleranceBps: 500,
            usdRate: { brlPerUnit: '5.42', date: '2026-10-09', source: 'bcb-ptax' }
        });
        expect(data.classes).toEqual(CLASS_INPUTS.classes);
        expect(data.assignments).toEqual(CLASS_INPUTS.assignments);
        expect(catalog.findManyByIds).toHaveBeenCalledExactlyOnceWith(['a1']);
        expect(quotes.getLatest).toHaveBeenCalledExactlyOnceWith(['a1']);
    });

    it('does not touch the catalog or the quotes when there are no positions', async () => {
        const { driver, catalog, quotes } = driverWith([]);

        const data = await driver.load();

        expect(data.assets).toEqual([]);
        expect(data.quotes).toEqual([]);
        expect(catalog.findManyByIds).not.toHaveBeenCalled();
        expect(quotes.getLatest).not.toHaveBeenCalled();
    });
});
