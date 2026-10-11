import { describe, expect, it } from 'vitest';
import { classIdOf, makePrototypeSource, makeSourceClasses } from '../../../../test/support/portfolio-fixtures';
import { largestDeviationOf, sharesBpsOf, summarizeClasses, targetValueOf } from './class-summary';
import { buildSnapshot } from './portfolio-snapshot';
import { ClassSummary } from './portfolio.types';

function summaryOf(systemKey: string, classes: readonly ClassSummary[]): ClassSummary {
    return classes.find((item: ClassSummary) => item.classId === classIdOf(systemKey)) as ClassSummary;
}

describe('class summary with the prototype portfolio', () => {
    const snapshot = buildSnapshot(makePrototypeSource());

    it('totals R$ 1,773,100.40', () => {
        expect(snapshot.totalMinor).toBe(177_310_040);
    });

    it('computes the share of every class and they add up to 10000', () => {
        const shares: Record<string, number> = Object.fromEntries(
            snapshot.classes.map((item: ClassSummary) => [item.systemKey, item.shareBps])
        );

        expect(shares).toEqual({
            rf_pos: 2082,
            rf_pre: 1161,
            rf_ipca: 728,
            acoes_br: 1242,
            fii: 656,
            acoes_eua: 2091,
            reits: 869,
            cripto: 1171
        });
        expect(snapshot.classes.reduce((sum: number, item: ClassSummary) => sum + item.shareBps, 0)).toBe(10000);
    });

    it('computes the deviation of every class against its target', () => {
        expect(snapshot.classes.map((item: ClassSummary) => item.deviationBps)).toEqual([82, 361, -472, -258, -44, -409, 69, 671]);
    });

    it('puts only crypto outside the tolerance and elects it the largest deviation', () => {
        expect(snapshot.outsideCount).toBe(1);
        expect(summaryOf('cripto', snapshot.classes).status).toBe('above');
        expect(snapshot.largestDeviation).toEqual({
            classId: classIdOf('cripto'),
            deviationBps: 671,
            gapMinor: -11_893_098,
            status: 'above'
        });
    });

    it('reports the gap to the target: positive is missing and negative is excess', () => {
        expect(summaryOf('rf_ipca', snapshot.classes).gapMinor).toBe(8_377_205);
        expect(summaryOf('cripto', snapshot.classes).gapMinor).toBe(-11_893_098);
    });

    it('keeps the classes plus the unclassified value equal to the total', () => {
        const sum: number = snapshot.classes.reduce((total: number, item: ClassSummary) => total + item.valueMinor, 0);

        expect(sum + snapshot.unclassifiedMinor).toBe(snapshot.totalMinor);
    });
});

describe('class summary edge cases', () => {
    it('returns zero shares and no largest deviation for an empty portfolio', () => {
        const classes = summarizeClasses({ classes: makeSourceClasses(), holdings: [], totalMinor: 0, toleranceBps: 500 });

        expect(classes.every((item: ClassSummary) => item.shareBps === 0 && item.valueMinor === 0 && item.gapMinor === 0)).toBe(true);
        expect(largestDeviationOf(classes, 0)).toBeNull();
    });

    it('breaks a tie of deviation by the larger gap and then by the lower sort order', () => {
        const base: ClassSummary = {
            classId: 'a',
            systemKey: null,
            name: null,
            displayName: 'a',
            colorKey: 'c1',
            sortOrder: 2,
            valueMinor: 0,
            shareBps: 0,
            targetBps: 0,
            deviationBps: 300,
            status: 'within',
            gapMinor: 100,
            holdingsCount: 0
        };
        const largerGap: ClassSummary = { ...base, classId: 'b', gapMinor: -200 };
        const lowerOrder: ClassSummary = { ...base, classId: 'c', sortOrder: 1 };

        expect(largestDeviationOf([base, largerGap], 10)?.classId).toBe('b');
        expect(largestDeviationOf([base, lowerOrder], 10)?.classId).toBe('c');
    });

    it('lists classes without holdings with zero value', () => {
        const classes = summarizeClasses({
            classes: makeSourceClasses(),
            holdings: [{ classId: classIdOf('fii'), valueMinor: 1000 }],
            totalMinor: 1000,
            toleranceBps: 500
        });

        expect(classes).toHaveLength(8);
        expect(summaryOf('fii', classes)).toMatchObject({ shareBps: 10000, holdingsCount: 1 });
        expect(summaryOf('cripto', classes)).toMatchObject({ valueMinor: 0, shareBps: 0, gapMinor: 50 });
    });

    it('rounds the shares half up', () => {
        expect(sharesBpsOf([1, 1], 4)).toEqual([2500, 2500]);
        expect(targetValueOf(1200, 177_310_040)).toBe(21_277_205);
    });

    it('adjusts by largest remainder so three equal parts still add up to 10000', () => {
        const shares: number[] = sharesBpsOf([1, 1, 1], 3);

        expect(shares).toEqual([3334, 3333, 3333]);
    });

    it('does not force 10000 when part of the total has no class', () => {
        expect(sharesBpsOf([1, 1], 3)).toEqual([3333, 3333]);
    });
});
