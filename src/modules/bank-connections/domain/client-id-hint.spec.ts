import { describe, expect, it } from 'vitest';
import { hintOf } from './client-id-hint';

describe('hintOf', () => {
    it('mostra os 4 primeiros e os 4 últimos caracteres de um uuid', () => {
        expect(hintOf('3f9a1b2c-4d5e-4f60-8a9b-c2e1d3f4a5b6')).toBe('3f9a…a5b6');
    });

    it('não revela mais que 8 caracteres de um texto curto', () => {
        expect(hintOf('abcdefghijk')).toBe('…');
        expect(hintOf('')).toBe('…');
        expect(hintOf('abcdefghijkl')).toBe('abcd…ijkl');
        expect(hintOf('abcdefghijkl').replace('…', '').length).toBeLessThanOrEqual(8);
    });
});
