import { describe, expect, it, vi } from 'vitest';
import { flatSeries } from '../../../../test/support/schedule-fixtures';
import { makeTitle } from '../../../../test/support/fixed-income-fixtures';
import { Asset, AssetCatalogService } from '../../catalog/services/asset-catalog.service';
import { FixedIncomeValuationService, ValuedTitle } from '../../fixed-income/services/fixed-income-valuation.service';
import { IndexSeriesReaderService } from '../../fixed-income/services/index-series-reader.service';
import { IssuerDirectoryService } from '../../issuers/services/issuer-directory.service';
import { ExchangeRateReaderService } from '../../market-data/services/exchange-rate-reader.service';
import { QuoteReaderService } from '../../market-data/services/quote-reader.service';
import { Position, PositionReaderService } from '../../positions/services/position-reader.service';
import { ScheduleSourceService } from './schedule-source.service';

const NOW: Date = new Date('2026-01-05T15:00:00Z');

function valued(overrides: Partial<ReturnType<typeof makeTitle>> = {}, status: string = 'ok'): ValuedTitle {
    return {
        title: makeTitle(overrides),
        valuation: {
            asOf: '2026-01-05',
            valueMinor: 10_500_000,
            currency: 'BRL',
            accruedBps: 500,
            matured: false,
            estimated: false,
            status,
            source: 'curve_pre',
            taxRegime: 'regressive',
            taxEstimatedMinor: 0,
            netEstimatedMinor: 10_500_000
        } as ValuedTitle['valuation']
    };
}

function asset(id: string, overrides: Partial<Asset> = {}): Asset {
    return {
        id,
        market: 'TESOURO',
        kind: 'treasury',
        externalId: 'selic:2029-03-01',
        suggestedClassKey: 'rf_pos',
        maturityDate: '2029-03-01',
        symbol: 'Tesouro Selic 2029',
        ...overrides
    } as Asset;
}

function position(id: string, assetId: string, quantity: string = '2'): Position {
    return { id, assetId, quantity, isSample: false } as unknown as Position;
}

function build(options: { titles?: ValuedTitle[]; positions?: Position[]; assets?: Asset[]; prices?: Record<string, string> } = {}) {
    const getLatest = vi
        .fn()
        .mockResolvedValue(new Map(Object.entries(options.prices ?? {}).map(([assetId, price]) => [assetId, { assetId, price }])));
    const latest = vi.fn().mockResolvedValue({ brlPerUnit: '5.5' });
    const find = vi.fn().mockReturnValue({ name: 'Banco Exemplo' });
    const listForCompany = vi.fn().mockResolvedValue(options.positions ?? []);
    const service = new ScheduleSourceService(
        { valueAll: vi.fn().mockResolvedValue(options.titles ?? []) } as unknown as FixedIncomeValuationService,
        { loadCurveSeries: vi.fn().mockResolvedValue(flatSeries()) } as unknown as IndexSeriesReaderService,
        { listForCompany } as unknown as PositionReaderService,
        { findManyByIds: vi.fn().mockResolvedValue(options.assets ?? []) } as unknown as AssetCatalogService,
        { getLatest } as unknown as QuoteReaderService,
        { latest } as unknown as ExchangeRateReaderService,
        { find } as unknown as IssuerDirectoryService
    );
    return { service, getLatest, latest, find, listForCompany };
}

describe('ScheduleSourceService', () => {
    it('passa o filtro de titular às posições e leva o titular do Tesouro', async () => {
        const doubles = build({
            positions: [{ ...position('p1', 'a1'), holderUserId: 'ana' } as Position],
            assets: [asset('a1')],
            prices: { a1: '1000' }
        });

        const treasuries = await doubles.service.loadTreasuries({ kind: 'person', userId: 'ana' });

        expect(doubles.listForCompany).toHaveBeenCalledWith({ kind: 'person', userId: 'ana' });
        expect(treasuries[0]?.holderUserId).toBe('ana');
    });

    it('a agenda lê a conta toda, sem filtro de titular', async () => {
        const doubles = build();

        await doubles.service.load(NOW);

        expect(doubles.listForCompany).toHaveBeenCalledWith({ kind: 'any' });
    });

    it('monta os títulos com o valor de hoje, o emissor e a data de referência', async () => {
        const doubles = build({ titles: [valued({ issuerId: 'banco-exemplo' }), valued({ id: 'title-2', issuerId: null })] });

        const inputs = await doubles.service.load(NOW);

        expect(inputs.today).toBe('2026-01-05');
        expect(inputs.titles.map((title) => [title.id, title.issuerName, title.valueMinor])).toEqual([
            ['title-1', 'Banco Exemplo', 10_500_000],
            ['title-2', null, 10_500_000]
        ]);
        expect(doubles.find).toHaveBeenCalledTimes(1);
        expect(inputs.usdRate).toBeNull();
        expect(doubles.latest).not.toHaveBeenCalled();
    });

    it('marca o título que a valorização não cobriu', async () => {
        const doubles = build({ titles: [valued({}, 'index_data_missing')] });

        const { titles } = await doubles.service.loadTitles(NOW);

        expect(titles[0]?.indexDataMissing).toBe(true);
    });

    it('busca a PTAX só quando há título em dólar', async () => {
        const doubles = build({ titles: [valued({ currency: 'USD' })] });

        const inputs = await doubles.service.load(NOW);

        expect(inputs.usdRate).toBe('5.5');
        doubles.latest.mockResolvedValue(null);
        expect((await doubles.service.load(NOW)).usdRate).toBeNull();
    });

    it('sem posições não toca no catálogo nem nas cotações', async () => {
        const doubles = build();

        const inputs = await doubles.service.load(NOW);

        expect(inputs.treasuries).toEqual([]);
        expect(doubles.getLatest).not.toHaveBeenCalled();
    });

    it('valoriza o Tesouro pela quantidade vezes a cotação e ignora o que não é Tesouro', async () => {
        const doubles = build({
            positions: [position('p1', 'a1', '2.5'), position('p2', 'a2'), position('p3', 'missing')],
            assets: [asset('a1'), asset('a2', { market: 'B3', kind: 'stock' })],
            prices: { a1: '1000.40' }
        });

        const { treasuries } = await doubles.service.load(NOW);

        expect(treasuries).toEqual([
            {
                id: 'p1',
                name: 'Tesouro Selic 2029',
                kind: 'selic',
                quantity: '2.5',
                maturityDate: '2029-03-01',
                valueTodayMinor: 250_100,
                isSample: false
            }
        ]);
        expect(doubles.getLatest).toHaveBeenCalledWith(['a1']);
    });

    it('Prefixado também é valorizado pela cotação do dia (o FGC usa o valor de hoje)', async () => {
        const doubles = build({
            positions: [position('p1', 'a1', '20'), position('p2', 'a2')],
            assets: [
                asset('a1', { externalId: 'prefixado:2029-01-01', suggestedClassKey: 'rf_pre' }),
                asset('a2', { suggestedClassKey: 'rf_ipca' })
            ],
            prices: { a1: '812' }
        });

        const { treasuries } = await doubles.service.load(NOW);

        expect(treasuries.map((item) => [item.id, item.kind, item.valueTodayMinor])).toEqual([
            ['p1', 'prefixado', 1_624_000],
            ['p2', 'ipca', null]
        ]);
        expect(doubles.getLatest).toHaveBeenCalledWith(['a1', 'a2']);
    });

    it('prefixado sem cotação fica sem valor de hoje', async () => {
        const doubles = build({
            positions: [position('p1', 'a1')],
            assets: [asset('a1', { externalId: 'prefixado:2029-01-01', suggestedClassKey: 'rf_pre' })]
        });

        const { treasuries } = await doubles.service.load(NOW);

        expect(treasuries.map((item) => item.valueTodayMinor)).toEqual([null]);
    });
});
