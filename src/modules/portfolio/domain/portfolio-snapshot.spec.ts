import { describe, expect, it } from 'vitest';
import { classIdOf, makePrototypeSource, PTAX_RATE } from '../../../../test/support/portfolio-fixtures';
import { buildSnapshot } from './portfolio-snapshot';
import { ClassSummary, Holding, PortfolioSourceData } from './portfolio.types';

function holdingOf(snapshot: ReturnType<typeof buildSnapshot>, symbol: string): Holding {
    return snapshot.holdings.find((holding: Holding) => holding.symbol === symbol) as Holding;
}

describe('portfolio snapshot', () => {
    it('values the holdings with source, native value and exposure', () => {
        const snapshot = buildSnapshot(makePrototypeSource());

        expect(holdingOf(snapshot, 'VOO')).toMatchObject({
            kind: 'position',
            nativeValueMinor: 2_180_000,
            nativeCurrency: 'USD',
            valueMinor: 11_815_600,
            valueSource: 'finnhub',
            unitPrice: '545',
            dollarExposure: true
        });
        expect(holdingOf(snapshot, 'TESOURO-SELIC-2029')).toMatchObject({ valueSource: 'tesouro_direto', valueMinor: 5_184_000 });
        expect(holdingOf(snapshot, 'CDB Inter')).toMatchObject({
            kind: 'fixed_income',
            assetId: null,
            quantity: null,
            valueSource: 'curve_cdi',
            valueMinor: 18_240_000
        });
        expect(holdingOf(snapshot, 'Treasury 2027')).toMatchObject({
            nativeValueMinor: 2_000_000,
            valueMinor: 10_840_000,
            dollarExposure: true
        });
    });

    it('orders holdings by class sort order and by value descending inside the class', () => {
        const snapshot = buildSnapshot(makePrototypeSource());

        const firstClass: string[] = snapshot.holdings
            .filter((h: Holding) => h.classId === classIdOf('rf_pos'))
            .map((h: Holding) => h.symbol);
        expect(firstClass).toEqual(['CDB Inter', 'LCI Itau', 'TESOURO-SELIC-2029']);
        expect(snapshot.holdings[0]?.classId).toBe(classIdOf('rf_pos'));
        expect(snapshot.holdings.at(-1)?.classId).toBe(classIdOf('cripto'));
    });

    it('switches the base to USD keeping the percentages', () => {
        const brl = buildSnapshot(makePrototypeSource());
        const usd = buildSnapshot(makePrototypeSource({ baseCurrency: 'USD' }));

        expect(usd.totalMinor).toBe(32_714_031);
        expect(usd.classes.map((item: ClassSummary) => item.shareBps)).toEqual(brl.classes.map((item: ClassSummary) => item.shareBps));
        expect(holdingOf(usd, 'ITUB4')).toMatchObject({ nativeCurrency: 'BRL', valueMinor: 1_394_834 });
        expect(holdingOf(usd, 'VOO').valueMinor).toBe(2_180_000);
    });

    it('serves a position without quote with zero value and flags it', () => {
        const snapshot = buildSnapshot(makePrototypeSource({ withoutQuotes: ['PETR4'] }));

        expect(holdingOf(snapshot, 'PETR4')).toMatchObject({
            missingQuote: true,
            valueMinor: 0,
            nativeValueMinor: 0,
            unitPrice: null,
            valueSource: 'brapi'
        });
        expect(snapshot.quality.missingQuotes).toBe(1);
    });

    it('flags a stale quote but keeps its value', () => {
        const source: PortfolioSourceData = makePrototypeSource();
        const stale: PortfolioSourceData = {
            ...source,
            quotes: source.quotes.map((quote) => (quote.assetId === 'asset-ITUB4' ? { ...quote, stale: true } : quote))
        };

        const snapshot = buildSnapshot(stale);

        expect(holdingOf(snapshot, 'ITUB4')).toMatchObject({ stale: true, valueMinor: 7_560_000 });
        expect(snapshot.quality.staleQuotes).toBe(1);
    });

    it('flags a missing exchange rate and zeroes only the converted holdings', () => {
        const snapshot = buildSnapshot(makePrototypeSource({ usdRate: null }));

        expect(holdingOf(snapshot, 'VOO')).toMatchObject({ missingRate: true, valueMinor: 0, nativeValueMinor: 2_180_000 });
        expect(holdingOf(snapshot, 'ITUB4').missingRate).toBe(false);
        expect(snapshot.quality.missingRates).toBe(8);
        expect(snapshot.usdRate).toBeNull();
    });

    it('counts estimated and index-missing fixed income', () => {
        const source: PortfolioSourceData = makePrototypeSource();
        const [first, second, ...rest] = source.titles;
        const flagged: PortfolioSourceData = {
            ...source,
            titles: [
                { ...(first as (typeof source.titles)[number]), estimated: true },
                { ...(second as (typeof source.titles)[number]), indexDataMissing: true },
                ...rest
            ]
        };

        const snapshot = buildSnapshot(flagged);

        expect(snapshot.quality).toMatchObject({ estimatedFixedIncome: 1, indexDataMissing: 1 });
    });

    it('is empty without holdings', () => {
        const source: PortfolioSourceData = makePrototypeSource();

        const snapshot = buildSnapshot({ ...source, positions: [], titles: [], quotes: [], assets: [], assignments: [] });

        expect(snapshot).toMatchObject({ empty: true, totalMinor: 0, unclassifiedMinor: 0, outsideCount: 0, largestDeviation: null });
        expect(snapshot.dollarExposure).toEqual({ valueMinor: 0, shareBps: 0 });
        expect(snapshot.classes.every((item: ClassSummary) => item.shareBps === 0)).toBe(true);
    });

    it('keeps a holding without assignment in the total and reports it as an orphan', () => {
        const source: PortfolioSourceData = makePrototypeSource();
        const orphaned: PortfolioSourceData = {
            ...source,
            assignments: source.assignments.filter((item) => item.subjectId !== 'position-ITUB4')
        };

        const snapshot = buildSnapshot(orphaned);

        expect(snapshot.totalMinor).toBe(177_310_040);
        expect(snapshot.unclassifiedMinor).toBe(7_560_000);
        expect(snapshot.orphanHoldings).toEqual([{ subjectType: 'position', subjectId: 'position-ITUB4' }]);
        expect(holdingOf(snapshot, 'ITUB4').classId).toBeNull();
        expect(snapshot.holdings.at(-1)?.symbol).toBe('ITUB4');
        const sum: number = snapshot.classes.reduce((total: number, item: ClassSummary) => total + item.valueMinor, 0);
        expect(sum + snapshot.unclassifiedMinor).toBe(snapshot.totalMinor);
    });

    it('splits the targets of a class equally when none is stored and respects stored ones', () => {
        const snapshot = buildSnapshot(makePrototypeSource());
        const equal: number[] = snapshot.holdings
            .filter((h: Holding) => h.classId === classIdOf('acoes_br'))
            .map((h: Holding) => h.effectiveTargetInClassBps);
        expect(equal.toSorted()).toEqual([3333, 3333, 3334]);

        const source: PortfolioSourceData = makePrototypeSource();
        const stored: PortfolioSourceData = {
            ...source,
            assignments: source.assignments.map((item) => {
                const bps: Record<string, number> = { 'position-ITUB4': 3000, 'position-WEGE3': 4000, 'position-PETR4': 3000 };
                return { ...item, targetInClassBps: bps[item.subjectId] ?? 0 };
            })
        };
        const respected = buildSnapshot(stored);
        expect(holdingOf(respected, 'WEGE3')).toMatchObject({ storedTargetInClassBps: 4000, effectiveTargetInClassBps: 4000 });
    });

    it('exposes the PTAX used', () => {
        expect(buildSnapshot(makePrototypeSource()).usdRate).toEqual(PTAX_RATE);
    });

    it('ignores assignments to classes that no longer exist', () => {
        const source: PortfolioSourceData = makePrototypeSource();
        const dangling: PortfolioSourceData = {
            ...source,
            assignments: source.assignments.map((item) => (item.subjectId === 'position-ITUB4' ? { ...item, classId: 'gone' } : item))
        };

        expect(buildSnapshot(dangling).unclassifiedMinor).toBe(7_560_000);
    });

    it('skips a position whose asset is not in the catalog', () => {
        const source: PortfolioSourceData = makePrototypeSource();

        const snapshot = buildSnapshot({ ...source, assets: source.assets.filter((asset) => asset.symbol !== 'ITUB4') });

        expect(snapshot.holdings.some((holding: Holding) => holding.symbol === 'ITUB4')).toBe(false);
    });
});
