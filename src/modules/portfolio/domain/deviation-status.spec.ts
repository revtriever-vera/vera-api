import { describe, expect, it } from 'vitest';
import { deviationStatusOf } from './deviation-status';

describe('deviation status', () => {
    it('treats a deviation equal to the tolerance as within, on both sides', () => {
        expect(deviationStatusOf(500, 500)).toBe('within');
        expect(deviationStatusOf(-500, 500)).toBe('within');
        expect(deviationStatusOf(0, 0)).toBe('within');
    });

    it('is above when the deviation exceeds the tolerance', () => {
        expect(deviationStatusOf(501, 500)).toBe('above');
    });

    it('is below when the deviation falls under minus the tolerance', () => {
        expect(deviationStatusOf(-501, 500)).toBe('below');
    });
});
