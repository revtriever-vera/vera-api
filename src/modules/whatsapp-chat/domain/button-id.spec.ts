import { describe, expect, it } from 'vitest';
import { buttonIdOf, parseButtonId } from './button-id';

const ID: string = '0192b6c0-0000-7000-8000-000000000001';

describe('button-id', () => {
    it('monta e lê o formato prefixo:ação:id', () => {
        expect(buttonIdOf('act', 'yes', ID)).toBe(`act:yes:${ID}`);
        expect(parseButtonId(`act:yes:${ID}`)).toEqual({ prefix: 'act', action: 'yes', id: ID });
        expect(parseButtonId(`rem:snooze1h:${ID}`)).toEqual({ prefix: 'rem', action: 'snooze1h', id: ID });
    });

    it('id malformado é ignorado', () => {
        for (const raw of [
            undefined,
            '',
            'act',
            'act:yes',
            `act:yes:${ID}:x`,
            'ACT:yes:abc',
            `act::${ID}`,
            'act:yes:not an id',
            'x'.repeat(300)
        ]) {
            expect(parseButtonId(raw)).toBeNull();
        }
    });
});
