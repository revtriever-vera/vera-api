import { describe, expect, it } from 'vitest';
import { compareCodeUnits, maxCodeUnits, minCodeUnits } from './compare-code-units';

describe('compareCodeUnits', () => {
    it('ordena por code unit, independente de locale', () => {
        expect(compareCodeUnits('a', 'b')).toBe(-1);
        expect(compareCodeUnits('b', 'a')).toBe(1);
        expect(compareCodeUnits('a', 'a')).toBe(0);
        expect(['b', 'B', 'a', 'A', '2026-10', '2026-09'].sort(compareCodeUnits)).toEqual(['2026-09', '2026-10', 'A', 'B', 'a', 'b']);
    });
});

describe('maxCodeUnits e minCodeUnits', () => {
    it('devolvem o maior e o menor por code unit', () => {
        expect(maxCodeUnits('2026-09-01', '2026-10-01')).toBe('2026-10-01');
        expect(minCodeUnits('2026-09-01', '2026-10-01')).toBe('2026-09-01');
        expect(maxCodeUnits('a', 'a')).toBe('a');
        expect(minCodeUnits('b', 'a')).toBe('a');
    });
});
