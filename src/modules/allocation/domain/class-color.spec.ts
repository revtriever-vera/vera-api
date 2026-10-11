import { describe, expect, it } from 'vitest';
import { CLASS_COLOR_KEYS } from './allocation.types';
import { nextColorKey } from './class-color';

describe('nextColorKey', () => {
    it('escolhe a menor cor ainda não usada', () => {
        expect(nextColorKey([])).toBe('c1');
        expect(nextColorKey(['c1', 'c2', 'c4'])).toBe('c3');
    });

    it('com todas as cores em uso volta ciclicamente à menos usada', () => {
        expect(nextColorKey([...CLASS_COLOR_KEYS])).toBe('c1');
        expect(nextColorKey([...CLASS_COLOR_KEYS, 'c1'])).toBe('c2');
    });
});
