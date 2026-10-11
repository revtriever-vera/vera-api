import { describe, expect, it } from 'vitest';
import { makeRule } from '../../../../test/support/spending-factories';
import { CategoryRule } from './categories.types';
import { compareRules, findWinningRule, ruleMatches, RuleSubject, sortByPrecedence } from './rule-precedence';

const SUBJECT: RuleSubject = { amountMinor: -2500, normalizedDescription: 'PADARIA ESTRELA CENTRO', counterpartyKey: 'abc123' };

describe('findWinningRule', () => {
    it('counterparty vence description, que vence contains', () => {
        const contains: CategoryRule = makeRule({ id: 'a', matchType: 'contains', pattern: 'PADARIA ESTRELA CENTRO' });
        const description: CategoryRule = makeRule({ id: 'b', matchType: 'description', pattern: 'PADARIA ESTRELA CENTRO' });
        const counterparty: CategoryRule = makeRule({ id: 'c', matchType: 'counterparty', pattern: 'abc123' });

        expect(findWinningRule(sortByPrecedence([contains, description, counterparty]), SUBJECT)?.id).toBe('c');
        expect(findWinningRule(sortByPrecedence([contains, description]), SUBJECT)?.id).toBe('b');
        expect(findWinningRule(sortByPrecedence([contains]), SUBJECT)?.id).toBe('a');
    });

    it('entre contains o padrão mais longo vence o mais curto', () => {
        const short: CategoryRule = makeRule({ id: 'short', pattern: 'PADARIA' });
        const long: CategoryRule = makeRule({ id: 'long', pattern: 'PADARIA ESTRELA' });

        expect(findWinningRule(sortByPrecedence([short, long]), SUBJECT)?.id).toBe('long');
    });

    it('no empate de tamanho ganha o mais recentemente atualizado', () => {
        const older: CategoryRule = makeRule({ id: 'older', pattern: 'PADARIA', updatedAt: new Date('2026-10-01T10:00:00.000Z') });
        const newer: CategoryRule = makeRule({ id: 'newer', pattern: 'ESTRELA', updatedAt: new Date('2026-10-05T10:00:00.000Z') });

        expect(findWinningRule(sortByPrecedence([older, newer]), SUBJECT)?.id).toBe('newer');
        expect(findWinningRule(sortByPrecedence([newer, older]), SUBJECT)?.id).toBe('newer');
    });

    it('desempata pelo id quando tamanho e data são iguais, de forma determinística', () => {
        const first: CategoryRule = makeRule({ id: 'a', pattern: 'PADARIA' });
        const second: CategoryRule = makeRule({ id: 'b', pattern: 'ESTRELA' });

        expect(sortByPrecedence([first, second]).map((rule: CategoryRule) => rule.id)).toEqual(['b', 'a']);
        expect(sortByPrecedence([second, first]).map((rule: CategoryRule) => rule.id)).toEqual(['b', 'a']);
    });

    it('appliesTo out não casa com entrada e in não casa com saída', () => {
        const out: CategoryRule = makeRule({ pattern: 'PADARIA', appliesTo: 'out' });
        const incoming: RuleSubject = { ...SUBJECT, amountMinor: 2500 };

        expect(ruleMatches(out, SUBJECT)).toBe(true);
        expect(ruleMatches(out, incoming)).toBe(false);
        expect(ruleMatches(makeRule({ pattern: 'PADARIA', appliesTo: 'in' }), SUBJECT)).toBe(false);
        expect(ruleMatches(makeRule({ pattern: 'PADARIA', appliesTo: 'in' }), incoming)).toBe(true);
    });

    it('counterparty só casa com a chave igual e nunca com chave nula', () => {
        const rule: CategoryRule = makeRule({ matchType: 'counterparty', pattern: 'abc123' });

        expect(ruleMatches(rule, SUBJECT)).toBe(true);
        expect(ruleMatches(rule, { ...SUBJECT, counterpartyKey: 'other' })).toBe(false);
        expect(ruleMatches(rule, { ...SUBJECT, counterpartyKey: null })).toBe(false);
    });

    it('description exige igualdade com a descrição inteira', () => {
        const rule: CategoryRule = makeRule({ matchType: 'description', pattern: 'PADARIA ESTRELA' });

        expect(ruleMatches(rule, SUBJECT)).toBe(false);
        expect(ruleMatches(rule, { ...SUBJECT, normalizedDescription: 'PADARIA ESTRELA' })).toBe(true);
    });

    it('devolve nulo quando nenhuma regra casa', () => {
        expect(findWinningRule([makeRule({ pattern: 'FARMACIA' })], SUBJECT)).toBeNull();
        expect(findWinningRule([], SUBJECT)).toBeNull();
    });

    it('compareRules devolve zero para a mesma regra', () => {
        const rule: CategoryRule = makeRule();

        expect(compareRules(rule, rule)).toBe(0);
    });
});
