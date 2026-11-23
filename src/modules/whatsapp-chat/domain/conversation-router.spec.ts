import { describe, expect, it } from 'vitest';
import { RouterFacts, isFreeQuestion, routeOf } from './conversation-router';

function facts(overrides: Partial<RouterFacts>): RouterFacts {
    return {
        kind: 'text',
        text: 'quanto gastei este mês?',
        pendingOpen: false,
        remindersAvailable: true,
        gate: 'available',
        consentGranted: true,
        ...overrides
    };
}

describe('ConversationRouter', () => {
    it('pergunta livre com tudo em ordem vai para o modelo', () => {
        expect(routeOf(facts({}))).toEqual({ name: 'ask' });
    });

    it('mensagem que não é texto recebe a recusa de mídia', () => {
        expect(routeOf(facts({ kind: 'unsupported', text: '' }))).toEqual({ name: 'unsupported' });
    });

    it('botão vai direto, sem modelo', () => {
        expect(routeOf(facts({ kind: 'button', text: '' }))).toEqual({ name: 'button' });
    });

    it('"sim" e "não" só valem com proposta aberta', () => {
        expect(routeOf(facts({ text: 'sim', pendingOpen: true }))).toEqual({ name: 'typed_confirmation', tap: 'yes' });
        expect(routeOf(facts({ text: 'Não.', pendingOpen: true }))).toEqual({ name: 'typed_confirmation', tap: 'no' });
        expect(routeOf(facts({ text: 'sim', pendingOpen: false }))).toEqual({ name: 'ask' });
        expect(routeOf(facts({ text: 'sim, mas muda', pendingOpen: true }))).toEqual({ name: 'ask' });
    });

    it('Pix vem antes de tudo que depende de Premium, permissão e cota', () => {
        const blocked: Partial<RouterFacts> = { gate: 'premium_required', consentGranted: false, text: 'faz um Pix de R$ 50 pra Maria' };
        expect(routeOf(facts(blocked))).toEqual({ name: 'pix_refusal' });
    });

    it('ajuda e saudação respondem sem modelo', () => {
        for (const text of ['ajuda', 'oi', 'Olá', 'bom dia']) {
            expect(routeOf(facts({ text }))).toEqual({ name: 'help' });
        }
    });

    it('comandos de lembrete só existem quando há quem os trate', () => {
        expect(routeOf(facts({ text: 'meus lembretes' }))).toEqual({ name: 'reminder_cmd', command: { kind: 'list' } });
        expect(routeOf(facts({ text: 'apagar lembrete 2' }))).toEqual({ name: 'reminder_cmd', command: { kind: 'delete', index: 2 } });
        expect(routeOf(facts({ text: 'meus lembretes', remindersAvailable: false }))).toEqual({ name: 'ask' });
    });

    it('a ordem: ajuda antes de lembrete, lembrete antes de Premium', () => {
        expect(routeOf(facts({ text: 'oi', gate: 'premium_required' }))).toEqual({ name: 'help' });
        expect(routeOf(facts({ text: 'meus lembretes', gate: 'paused' }))).toMatchObject({ name: 'reminder_cmd' });
    });

    it('Premium encerrado, cota pausada e recurso desligado, nessa ordem antes da permissão', () => {
        expect(routeOf(facts({ gate: 'premium_required', consentGranted: false }))).toEqual({ name: 'premium_required' });
        expect(routeOf(facts({ gate: 'paused', consentGranted: false }))).toEqual({ name: 'paused' });
        expect(routeOf(facts({ gate: 'disabled' }))).toEqual({ name: 'disabled' });
    });

    it('sem permissão de envio, a instrução e nada de modelo', () => {
        expect(routeOf(facts({ consentGranted: false }))).toEqual({ name: 'no_consent' });
    });

    it('isFreeQuestion separa o que vira turno do modelo', () => {
        expect(isFreeQuestion('quanto gastei?')).toBe(true);
        expect(isFreeQuestion('oi')).toBe(false);
        expect(isFreeQuestion('faz um pix')).toBe(false);
        expect(isFreeQuestion('meus lembretes')).toBe(false);
    });
});
