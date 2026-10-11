import { describe, expect, it } from 'vitest';
import { compareCodeUnits } from './compare-code-units';

describe('compareCodeUnits', () => {
    it('ordena por code unit, independente de locale', () => {
        expect(compareCodeUnits('a', 'b')).toBe(-1);
        expect(compareCodeUnits('b', 'a')).toBe(1);
        expect(compareCodeUnits('a', 'a')).toBe(0);
        expect(['b', 'B', 'a', 'A', '2026-10', '2026-09'].sort(compareCodeUnits)).toEqual(['2026-09', '2026-10', 'A', 'B', 'a', 'b']);
    });
});
