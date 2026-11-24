import { describe, expect, it } from 'vitest';
import { holdingSchema } from '../validation/portfolio.schemas';
import { VALUE_SOURCE_BY_MARKET, VALUE_SOURCE_BY_PROVIDER } from './portfolio.types';

describe('fund holdings', () => {
    it('are valued by the CVM quota, by market and by the provider that quoted them', () => {
        expect(VALUE_SOURCE_BY_MARKET['CVM']).toBe('cvm');
        expect(VALUE_SOURCE_BY_PROVIDER['cvm']).toBe('cvm');
    });

    it('are accepted by the holding contract with market CVM and group fundos', () => {
        const shape = holdingSchema.shape;

        expect(shape.market.safeParse('CVM').success).toBe(true);
        expect(shape.typeGroup.safeParse('fundos').success).toBe(true);
        expect(shape.valueSource.safeParse('cvm').success).toBe(true);
    });
});
