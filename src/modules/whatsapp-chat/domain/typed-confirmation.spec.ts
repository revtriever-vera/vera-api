import { describe, expect, it } from 'vitest';
import { typedConfirmationOf } from './typed-confirmation';

describe('typed-confirmation', () => {
    it.each([
        ['sim', 'yes'],
        ['Sim.', 'yes'],
        ['  SIM!  ', 'yes'],
        ['yes', 'yes'],
        ['não', 'no'],
        ['Nao', 'no'],
        ['no', 'no']
    ])('%s vale como toque', (text: string, expected: string) => {
        expect(typedConfirmationOf(text)).toBe(expected);
    });

    it.each(['sim, mas muda o horário', 'talvez', 'simmm', 'não sei', ''])('"%s" não conta', (text: string) => {
        expect(typedConfirmationOf(text)).toBeNull();
    });
});
