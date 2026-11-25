import { describe, expect, it } from 'vitest';
import { allocateFees } from './fee-allocation.util';

describe('allocateFees', () => {
    it('splits proportionally to the volume of each line and keeps the exact total', () => {
        const shares: number[] = allocateFees(100, [1000, 3000, 6000]);

        expect(shares).toEqual([10, 30, 60]);
    });

    it('gives the leftover cents to the largest remainders, earliest first on a tie', () => {
        expect(allocateFees(100, [1, 1, 1])).toEqual([34, 33, 33]);
        const shares: number[] = allocateFees(101, [5000, 3000, 2000]);
        expect(shares.reduce((sum: number, share: number): number => sum + share, 0)).toBe(101);
        expect(shares).toEqual([51, 30, 20]);
    });

    it('splits evenly when there is no volume and returns nothing without lines', () => {
        expect(allocateFees(5, [0, 0])).toEqual([3, 2]);
        expect(allocateFees(5, [])).toEqual([]);
    });
});
