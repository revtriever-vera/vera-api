import { describe, expect, it } from 'vitest';
import { DecimalUtil } from '../../../shared/utils/decimal.util';
import { largestRemainder } from './largest-remainder';

describe('largestRemainder', () => {
    it('gives the leftover unit to the largest fractional part', () => {
        const shares = [DecimalUtil.of('0.2'), DecimalUtil.of('0.7'), DecimalUtil.of('0.1')];

        expect(largestRemainder(shares, 1)).toEqual([0, 1, 0]);
    });

    it('breaks ties by input order', () => {
        const third = DecimalUtil.of(100).div(3);

        expect(largestRemainder([third, third, third], 100)).toEqual([34, 33, 33]);
    });

    it('keeps exact integers untouched', () => {
        expect(largestRemainder([DecimalUtil.of(40), DecimalUtil.of(60)], 100)).toEqual([40, 60]);
    });

    it('returns an empty list for no shares', () => {
        expect(largestRemainder([], 0)).toEqual([]);
    });
});
