import { describe, expect, it, vi } from 'vitest';
import { Asset, AssetCatalogService } from '../../catalog/services/asset-catalog.service';
import { AssetSimulation, PositionOperationsService } from '../../positions/services/position-operations.service';
import { EvaluatedLine, StoredLine } from '../domain/investment-import.types';
import { applyEdits } from '../domain/line-edits';
import { Evaluation, ImportLineEvaluatorService } from './import-line-evaluator.service';

const APPLE: Asset = { id: 'a-aapl', symbol: 'AAPL', externalId: 'AAPL', name: 'Apple', market: 'US' } as unknown as Asset;

function line(extra: Partial<StoredLine> = {}): StoredLine {
    return {
        lineId: 'L1',
        lineNumber: 1,
        kind: 'buy',
        incomeKind: null,
        direction: 'credit',
        tradeDate: '2026-08-05',
        ticker: 'AAPL',
        quantity: '5',
        unitPrice: '200',
        grossMinor: 100000,
        feesMinor: 0,
        currency: 'USD',
        market: 'US',
        sourceRef: 'model:x:1',
        check: null,
        dollar: { fxRate: '5', grossBrlMinor: 500000, withheldTaxMinor: null, closingQuantity: '15' },
        ...extra
    };
}

function rig(afterQuantity: string, latest: Map<string, string>, assets: Asset[] = [APPLE]): ImportLineEvaluatorService {
    const catalog: Pick<AssetCatalogService, 'findManyByMarketAndExternalIds' | 'findBestByMarketAndSymbols' | 'findManyByIds'> = {
        findManyByMarketAndExternalIds: vi.fn((market: string): Promise<Asset[]> => Promise.resolve(market === 'US' ? assets : [])),
        findBestByMarketAndSymbols: vi.fn((): Promise<Asset[]> => Promise.resolve([])),
        findManyByIds: vi.fn((): Promise<Asset[]> => Promise.resolve([]))
    };
    const operations: Pick<PositionOperationsService, 'duplicateLines' | 'simulate' | 'latestTradeDates'> = {
        duplicateLines: vi.fn((): Promise<ReadonlySet<number>> => Promise.resolve(new Set())),
        latestTradeDates: vi.fn((): Promise<Map<string, string>> => Promise.resolve(latest)),
        simulate: vi.fn((): Promise<AssetSimulation[]> =>
            Promise.resolve([
                {
                    effect: { assetId: 'a-aapl', before: null, after: { quantity: afterQuantity, averagePrice: '200' } },
                    hasPosition: false,
                    failures: []
                }
            ])
        )
    };
    return new ImportLineEvaluatorService(catalog as AssetCatalogService, operations as PositionOperationsService);
}

async function evaluate(service: ImportLineEvaluatorService, lines: StoredLine[]): Promise<EvaluatedLine[]> {
    const evaluation: Evaluation = await service.evaluate(null, applyEdits(lines, []));
    return [...evaluation.lines];
}

describe('ImportLineEvaluatorService with a statement from a broker abroad', () => {
    it('finds the asset in the US market and exposes the rate and the BRL gross', async () => {
        const [first] = await evaluate(rig('15', new Map()), [line()]);
        expect(first).toMatchObject({ status: 'ok', assetId: 'a-aapl', fxRate: '5', grossBrlMinor: 500000, withheldTaxMinor: null });
    });

    it('says the asset was not found when the US catalog has no symbol', async () => {
        const [first] = await evaluate(rig('15', new Map(), []), [line()]);
        expect(first).toMatchObject({ status: 'blocked', reason: 'asset_not_found' });
    });

    it('asks to check when the quantity after the import does not match the summary', async () => {
        const [first] = await evaluate(rig('5', new Map()), [line()]);
        expect(first).toMatchObject({ status: 'check', reason: 'position_mismatch' });
    });

    it('warns when the month comes after trades already recorded for the asset', async () => {
        const [first] = await evaluate(rig('15', new Map([['a-aapl', '2026-09-22']])), [line()]);
        expect(first).toMatchObject({ status: 'check', reason: 'out_of_order' });
    });

    it('does not look at the history for lines of other sources', async () => {
        const plain: StoredLine = { ...line({ market: 'B3', currency: 'BRL' }), dollar: undefined };
        const [first] = await evaluate(rig('1', new Map([['a-aapl', '2030-01-01']]), []), [plain]);
        expect(first?.reason).toBe('asset_not_found');
    });
});

describe('ImportLineEvaluatorService with an assumed-cost line on an asset that already has a position', () => {
    it('leaves the line out of the simulated effect', async () => {
        const simulate = vi.fn((_holder: string | null, ops: readonly { lineNumber: number }[]): Promise<AssetSimulation[]> =>
            Promise.resolve(
                ops.length === 0
                    ? []
                    : [
                          {
                              effect: {
                                  assetId: 'a-aapl',
                                  before: { quantity: '3', averagePrice: '420' },
                                  after: { quantity: '6', averagePrice: '426.5' }
                              },
                              hasPosition: true,
                              failures: []
                          }
                      ]
            )
        );
        const catalog = {
            findManyByMarketAndExternalIds: vi.fn((m: string): Promise<Asset[]> => Promise.resolve(m === 'US' ? [APPLE] : [])),
            findBestByMarketAndSymbols: vi.fn((): Promise<Asset[]> => Promise.resolve([])),
            findManyByIds: vi.fn((): Promise<Asset[]> => Promise.resolve([]))
        };
        const operations = {
            duplicateLines: vi.fn((): Promise<ReadonlySet<number>> => Promise.resolve(new Set())),
            latestTradeDates: vi.fn((): Promise<Map<string, string>> => Promise.resolve(new Map())),
            simulate
        };
        const service = new ImportLineEvaluatorService(
            catalog as unknown as AssetCatalogService,
            operations as unknown as PositionOperationsService
        );
        const evaluation: Evaluation = await service.evaluate(null, applyEdits([line({ check: 'assumed_cost', dollar: undefined })], []));
        expect(evaluation.lines[0]).toMatchObject({ status: 'ignored', reason: 'skipped' });
        expect(evaluation.effects[0]?.after).toEqual({ quantity: '3', averagePrice: '420' });
        expect(evaluation.operations).toHaveLength(0);
    });
});
