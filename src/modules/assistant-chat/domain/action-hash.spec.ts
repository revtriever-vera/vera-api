import { describe, expect, it } from 'vitest';
import { actionHashOf, stateHashOf } from './action-hash';

describe('hash da ação pendente', () => {
    it('não depende da ordem das chaves do payload', () => {
        const left: string = actionHashOf('goal_create', { name: 'Viagem', nested: { a: 1, b: [1, 2] }, targetMinor: 100 });
        const right: string = actionHashOf('goal_create', { targetMinor: 100, nested: { b: [1, 2], a: 1 }, name: 'Viagem' });

        expect(left).toBe(right);
    });

    it('muda com a ferramenta e com qualquer valor do payload', () => {
        const base: string = actionHashOf('goal_create', { name: 'Viagem', targetMinor: 100 });

        expect(actionHashOf('transaction_categorize', { name: 'Viagem', targetMinor: 100 })).not.toBe(base);
        expect(actionHashOf('goal_create', { name: 'Viagem', targetMinor: 101 })).not.toBe(base);
        expect(actionHashOf('goal_create', { name: 'Viagem', targetMinor: 100, extra: null })).not.toBe(base);
    });

    it('o hash do estado distingue estados diferentes', () => {
        expect(stateHashOf('a|b')).toBe(stateHashOf('a|b'));
        expect(stateHashOf('a|b')).not.toBe(stateHashOf('a|c'));
    });
});
