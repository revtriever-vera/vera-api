import { describe, expect, it } from 'vitest';
import { allocate, AllocationItem } from './allocate';

const PROTOTYPE_CLASSES: readonly AllocationItem[] = [
    { key: 'rf_pos', currentMinor: 36_914_000, targetBps: 2000 },
    { key: 'rf_pre', currentMinor: 20_584_000, targetBps: 800 },
    { key: 'rf_ipca', currentMinor: 12_900_000, targetBps: 1200 },
    { key: 'acoes_br', currentMinor: 22_017_000, targetBps: 1500 },
    { key: 'fii', currentMinor: 11_640_000, targetBps: 700 },
    { key: 'acoes_eua', currentMinor: 37_081_960, targetBps: 2500 },
    { key: 'reits', currentMinor: 15_414_480, targetBps: 800 },
    { key: 'cripto', currentMinor: 20_758_600, targetBps: 500 }
];

function item(key: string, currentMinor: number, targetBps: number): AllocationItem {
    return { key, currentMinor, targetBps };
}

function seeded(seed: number): () => number {
    let state: number = seed;
    return (): number => {
        state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;
        return state / 4_294_967_296;
    };
}

describe('allocate', () => {
    it('distributes the prototype contribution of R$ 10.000,00 across the classes', () => {
        const result = allocate(1_000_000, PROTOTYPE_CLASSES);

        expect(result).toEqual([0, 0, 394_046, 219_325, 39_033, 347_596, 0, 0]);
    });

    it('distributes inside Ações Brasil without touching the asset above its target', () => {
        const result = allocate(219_325, [item('ITUB4', 7_560_000, 3000), item('WEGE3', 7_815_000, 4000), item('PETR4', 6_642_000, 3000)]);

        expect(result).toEqual([0, 213_607, 5_718]);
    });

    it('splits in proportion to what is missing when the amount does not cover it', () => {
        expect(allocate(1000, [item('A', 500, 6000), item('B', 500, 4000)])).toEqual([700, 300]);
    });

    it('gives nothing to a class above its target', () => {
        expect(allocate(200, [item('A', 900, 5000), item('B', 100, 5000)])).toEqual([0, 200]);
    });

    it('spreads the surplus by target when the targets add up to less than 100%', () => {
        expect(allocate(1000, [item('A', 500, 5000), item('B', 500, 3000)])).toEqual([750, 250]);
    });

    it('follows the targets when every item is above its target', () => {
        expect(allocate(100, [item('A', 500, 3000), item('B', 500, 3000)])).toEqual([50, 50]);
    });

    it('never loses a unit: three equal items and 100 give 34, 33 and 33', () => {
        expect(allocate(100, [item('A', 0, 3333), item('B', 0, 3333), item('C', 0, 3333)])).toEqual([34, 33, 33]);
    });

    it('sends a single unit to one item only', () => {
        const result = allocate(1, [item('A', 0, 3333), item('B', 0, 3333), item('C', 0, 3334)]);

        expect(result).toEqual([0, 0, 1]);
    });

    it('follows the targets on an empty portfolio', () => {
        const result = allocate(10_000, [item('A', 0, 6000), item('B', 0, 4000)]);

        expect(result).toEqual([6000, 4000]);
    });

    it('never funds a target zero item while another has a target', () => {
        expect(allocate(500, [item('A', 0, 0), item('B', 0, 10_000)])).toEqual([0, 500]);
    });

    it('falls back to an equal split when every target is zero', () => {
        expect(allocate(101, [item('A', 10, 0), item('B', 90, 0)])).toEqual([51, 50]);
    });

    it('returns nothing for no items', () => {
        expect(allocate(100, [])).toEqual([]);
    });

    it('always adds up to the amount and never goes negative (random, fixed seed)', () => {
        const random = seeded(20_261_011);
        for (let round = 0; round < 300; round += 1) {
            const size: number = 1 + Math.floor(random() * 9);
            const items: AllocationItem[] = Array.from({ length: size }, (_, index: number) =>
                item(String(index), Math.floor(random() * 5_000_000), Math.floor(random() * 4000))
            );
            const amount: number = 1 + Math.floor(random() * 3_000_000);

            const result: readonly number[] = allocate(amount, items);

            expect(result.reduce((sum: number, value: number) => sum + value, 0)).toBe(amount);
            expect(result.every((value: number) => Number.isInteger(value) && value >= 0)).toBe(true);
        }
    });
});
