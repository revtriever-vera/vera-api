import { describe, expect, it } from 'vitest';
import { firstNameOf } from './first-name.util';

describe('firstNameOf', () => {
    it('devolve a primeira palavra do nome', () => {
        expect(firstNameOf('  Maria  da Silva ')).toBe('Maria');
    });

    it('devolve vazio para nome vazio', () => {
        expect(firstNameOf('   ')).toBe('');
    });
});
