import { describe, expect, it } from 'vitest';
import { needsInvestmentNotice } from './ask-notice';

describe('aviso de investimento', () => {
    it('a resposta que usou portfolio_news leva o aviso, mesmo sem nome de ativo no texto', () => {
        const result = { ending: 'answered', text: 'Saiu um comunicado esta semana.', toolsUsed: ['portfolio_news'] } as const;

        expect(needsInvestmentNotice(result, 'o que saiu de novo?')).toBe(true);
        expect(needsInvestmentNotice({ ...result, toolsUsed: ['list_categories'] }, 'o que saiu de novo?')).toBe(false);
    });
});
