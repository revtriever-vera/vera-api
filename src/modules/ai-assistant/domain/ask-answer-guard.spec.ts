import { describe, expect, it } from 'vitest';
import { AiTextRenderer } from './context/ai-text-renderer';
import { AnswerFacts, AnswerVerdict, guardAnswer, sentencesIn } from './ask-answer-guard';

const FACTS: AnswerFacts = {
    numbers: [3200, 18],
    keys: new Map([['cat:eating_out', { kind: 'cat', name: 'Delivery e restaurantes' }]])
};

function check(text: string): AnswerVerdict {
    return guardAnswer({ text, facts: FACTS, locale: 'pt-BR', renderer: new AiTextRenderer() });
}

describe('guardAnswer', () => {
    it('troca o marcador pelo nome e converte o destaque para o negrito do WhatsApp', () => {
        expect(check('Em setembro foram **R$ 3.200** em [[cat:eating_out]], 18% acima da média.')).toEqual({
            ok: true,
            text: 'Em setembro foram *R$ 3.200* em delivery e restaurantes, 18% acima da média.'
        });
    });

    it('reprova mais de três frases', () => {
        const verdict: AnswerVerdict = check('Foram R$ 3.200. Subiu 18%. Foi em delivery. Veja de novo.');
        expect(verdict).toMatchObject({ ok: false, check: 'sentences' });
    });

    it('não conta o ponto do milhar como fim de frase', () => {
        expect(sentencesIn('Foram R$ 3.200 em delivery.')).toBe(1);
    });

    it('reprova número que nenhuma ferramenta devolveu', () => {
        expect(check('Foram R$ 9.999 em delivery.')).toMatchObject({ ok: false, check: 'number' });
    });

    it('reprova marcador desconhecido', () => {
        expect(check('Foram R$ 3.200 em [[cat:cinema]].')).toMatchObject({ ok: false, check: 'marker' });
    });

    it('reprova mais de 600 caracteres', () => {
        expect(check(`R$ 3.200 ${'a'.repeat(600)}`)).toMatchObject({ ok: false, check: 'length' });
    });

    it('reprova lista, título, link e código', () => {
        expect(check('- R$ 3.200 em delivery')).toMatchObject({ ok: false, check: 'format' });
        expect(check('# R$ 3.200 em delivery')).toMatchObject({ ok: false, check: 'format' });
        expect(check('Veja [aqui](http://x.y) R$ 3.200')).toMatchObject({ ok: false, check: 'format' });
        expect(check('Foram `R$ 3.200`')).toMatchObject({ ok: false, check: 'format' });
    });

    it('reprova termo proibido e resposta vazia', () => {
        expect(check('Compre PETR4 agora.')).toMatchObject({ ok: false, check: 'forbidden_term' });
        expect(check('  ')).toMatchObject({ ok: false, check: 'length' });
    });
});
