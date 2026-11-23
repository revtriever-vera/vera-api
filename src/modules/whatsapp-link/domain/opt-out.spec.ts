import { describe, expect, it } from 'vitest';
import { parseOptOut } from './opt-out';

describe('parseOptOut', () => {
    it.each([
        ['desvincular', 'user_chat'],
        ['sair', 'user_chat'],
        ['cancelar', 'user_chat'],
        ['parar', 'opt_out'],
        ['stop', 'opt_out'],
        ['  SAIR. ', 'user_chat'],
        ['Stop!', 'opt_out'],
        ['Parar...', 'opt_out']
    ])('reads %j as %s', (text: string, reason: string) => {
        expect(parseOptOut(text)).toBe(reason);
    });

    it.each(['quero sair do cartão', 'não quero parar', 'stopp', '', 'constructor', 'toString', 'pare'])('ignores %j', (text: string) => {
        expect(parseOptOut(text)).toBeNull();
    });
});
