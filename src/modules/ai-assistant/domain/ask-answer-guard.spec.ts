import { describe, expect, it } from 'vitest';
import { AiTextRenderer } from './context/ai-text-renderer';
import { CHANNEL_PROFILES, ChannelProfile } from './ask-channel-profiles';
import { HELP_ROUTES } from './help/help-catalog';
import { AnswerFacts, AnswerVerdict, guardAnswer, sentencesIn } from './ask-answer-guard';

const FACTS: AnswerFacts = {
    numbers: [3200, 18],
    keys: new Map([['cat:eating_out', { kind: 'cat', name: 'Delivery e restaurantes' }]]),
    assets: new Set(['petr4']),
    links: new Set(['/portfolio/goals', '/spending/cuts'])
};

function check(text: string, profile: ChannelProfile = CHANNEL_PROFILES.whatsapp): AnswerVerdict {
    return guardAnswer({ text, facts: FACTS, locale: 'pt-BR', renderer: new AiTextRenderer(), profile, routes: HELP_ROUTES });
}

describe('guardAnswer', () => {
    it('troca o marcador pelo nome e converte o destaque para o negrito do WhatsApp', () => {
        expect(check('Em setembro foram **R$ 3.200** em [[cat:eating_out]], 18% acima da média.')).toEqual({
            ok: true,
            text: 'Em setembro foram *R$ 3.200* em Delivery e restaurantes, 18% acima da média.'
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

    it('no WhatsApp o ticker da pergunta passa e o inventado reprova', () => {
        expect(check('PETR4 pesa 18% da carteira.')).toMatchObject({ ok: true });
        expect(check('VALE3 pesa 18% da carteira.')).toMatchObject({ ok: false, check: 'forbidden_term' });
        expect(check('Venda suas ações de PETR4.')).toMatchObject({ ok: false, check: 'forbidden_term' });
    });
});

describe('guardAnswer no app', () => {
    const APP: ChannelProfile = CHANNEL_PROFILES.app;

    it('mantém o negrito do app e aceita até cinco frases e 900 caracteres', () => {
        const text: string = 'Foram **R$ 3.200**. Subiu 18%. Foi em delivery. Veja o mês. Veja a meta.';
        expect(check(text, APP)).toEqual({ ok: true, text });
        expect(check('Foram R$ 3.200. Subiu 18%. Foi em delivery. Veja o mês. Veja a meta. Veja tudo.', APP)).toMatchObject({
            ok: false,
            check: 'sentences'
        });
        expect(check(`R$ 3.200 ${'a'.repeat(900)}`, APP)).toMatchObject({ ok: false, check: 'length' });
    });

    it('aceita o link para uma rota que a ferramenta devolveu e reprova o resto', () => {
        expect(check('Veja em [Objetivos](/portfolio/goals).', APP)).toEqual({ ok: true, text: 'Veja em [Objetivos](/portfolio/goals).' });
        expect(check('Veja em [Objetivos](/outra).', APP)).toMatchObject({ ok: false, check: 'link' });
        expect(check('Veja em [Objetivos](https://x.y).', APP)).toMatchObject({ ok: false, check: 'link' });
        expect(check('Veja em [Objetivos](/portfolio/goals', APP)).toMatchObject({ ok: false, check: 'format' });
    });

    it('continua reprovando lista, título e código', () => {
        expect(check('- R$ 3.200 em delivery', APP)).toMatchObject({ ok: false, check: 'format' });
        expect(check('Foram `R$ 3.200`', APP)).toMatchObject({ ok: false, check: 'format' });
    });

    it('não confunde o número da rota com número da resposta', () => {
        const facts: AnswerFacts = { ...FACTS, links: new Set(['/ajuda/passo-9999']) };
        const verdict: AnswerVerdict = guardAnswer({
            text: 'Veja [o passo](/ajuda/passo-9999).',
            facts,
            locale: 'pt-BR',
            renderer: new AiTextRenderer(),
            profile: APP,
            routes: new Set(['/ajuda/passo-9999'])
        });
        expect(verdict).toMatchObject({ ok: true });
    });

    it('reprova link que a ferramenta devolveu mas não está no catálogo de ajuda', () => {
        const facts: AnswerFacts = { ...FACTS, links: new Set(['/portfolio/goals', '/fora-do-catalogo']) };
        const input = { facts, locale: 'pt-BR', renderer: new AiTextRenderer(), profile: APP, routes: HELP_ROUTES } as const;
        expect(guardAnswer({ ...input, text: 'Veja [Objetivos](/portfolio/goals).' })).toMatchObject({ ok: true });
        expect(guardAnswer({ ...input, text: 'Veja [Fora](/fora-do-catalogo).' })).toMatchObject({ ok: false, check: 'link' });
    });
});
