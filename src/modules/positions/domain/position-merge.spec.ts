import { describe, expect, it } from 'vitest';
import { mergedPositionPatch } from './position-merge';
import { Position } from './positions.types';

function position(quantity: string, averagePrice: string | null): Position {
    return { quantity, averagePrice } as Position;
}

describe('mergedPositionPatch', () => {
    it('sums the quantity and weights the average price by it', () => {
        expect(mergedPositionPatch(position('10', '30'), position('30', '50'))).toEqual({ quantity: '40', averagePrice: '45' });
    });

    it('keeps the only known price', () => {
        expect(mergedPositionPatch(position('10', null), position('5', '12.5'))).toEqual({ quantity: '15', averagePrice: '12.5' });
        expect(mergedPositionPatch(position('10', '7'), position('5', null))).toEqual({ quantity: '15', averagePrice: '7' });
        expect(mergedPositionPatch(position('1', null), position('2', null))).toEqual({ quantity: '3', averagePrice: null });
    });

    it('keeps the price of the kept position when both quantities are zero', () => {
        expect(mergedPositionPatch(position('0', '9'), position('0', '3'))).toEqual({ quantity: '0', averagePrice: '9' });
    });

    it('rounds to the precision of the columns', () => {
        expect(mergedPositionPatch(position('1', '1'), position('2', '2'))).toEqual({ quantity: '3', averagePrice: '1.66666667' });
    });
});
