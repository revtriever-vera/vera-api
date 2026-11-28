import { describe, expect, it } from 'vitest';
import { OnboardingActionOutOfStepError } from '../onboarding.errors';
import { OnboardingScript } from './onboarding-script';
import { ONBOARDING_SCRIPT } from './onboarding-steps';
import { say } from './script-turn';
import { ScriptAction, ScriptFlow, ScriptMessage, ScriptState, ScriptStepDefinition, ScriptTurn } from './script.types';

const WELCOME_TEXT: string =
    'Oi, Marina! Eu sou a Vera. Vou montar sua conta com você em poucos minutos.\n\nPara começar: o que você quer acompanhar aqui?';
const OFF_SCRIPT_TEXT: string =
    'Aqui eu sigo um roteiro curto para montar a conta, então ainda não respondo perguntas soltas.\n\nEscolhe uma das opções acima ou manda o arquivo. Sua pergunta eu respondo no Perguntar à Vera, depois da configuração.';
const SUMMARY_TEXT: string = 'Pronto, sua conta está montada. Aqui está o que ficou:';
const CLOSED_WITH_PENDING: string =
    'Fechado. Concluí com o que já temos; o que faltou fica como pendência no painel, e você pode me chamar para seguir quando quiser.';

function run(script: OnboardingScript, actions: readonly ScriptAction[]): { state: ScriptState; log: ScriptMessage[] } {
    const first: ScriptTurn = script.initial('Marina');
    const log: ScriptMessage[] = [...first.messages];
    const state: ScriptState = actions.reduce((current: ScriptState, action: ScriptAction): ScriptState => {
        const turn: ScriptTurn = script.reduce(current, action);
        log.push(...turn.messages);
        return turn.state;
    }, first.state);
    return { state, log };
}

function texts(messages: readonly ScriptMessage[]): string[] {
    return messages.map((message: ScriptMessage): string => `${message.role}: ${message.text}`);
}

function chipIds(message: ScriptMessage | undefined): string[] {
    return (message?.payload.chips ?? []).map((chip: { id: string }): string => chip.id);
}

describe('OnboardingScript (esqueleto do roteiro)', () => {
    it('abre com as boas-vindas e os 4 botões, ativo na escolha de módulos', () => {
        const turn: ScriptTurn = ONBOARDING_SCRIPT.initial('Marina');

        expect(texts(turn.messages)).toEqual([`vera: ${WELCOME_TEXT}`]);
        expect(chipIds(turn.messages[0])).toEqual(['modules.portfolio', 'modules.spending', 'modules.both', 'modules.explain']);
        expect(turn.messages[0]?.payload.chips?.[3]).toMatchObject({ label: 'Ainda não sei', quiet: true, action: { type: 'EXPLAIN' } });
        expect(ONBOARDING_SCRIPT.view(turn.state)).toEqual({ status: 'active', step: 'modules', remainingSteps: 1, pending: [] });
    });

    it('sem nome, cumprimenta sem nome', () => {
        expect(ONBOARDING_SCRIPT.initial(null).messages[0]?.text).toMatch(/^Oi! Eu sou a Vera\./);
    });

    it('só investimentos: grava os módulos e termina com a pendência de configuração', () => {
        const first: ScriptTurn = ONBOARDING_SCRIPT.initial('Marina');
        const turn: ScriptTurn = ONBOARDING_SCRIPT.reduce(first.state, { type: 'CHOOSE_MODULES', portfolio: true, spending: false });

        expect(texts(turn.messages)).toEqual([
            'person: Meus investimentos',
            'vera: Fechado. Gastos fica desligado por enquanto; dá para ligar em Configurações › Módulos, ou é só me pedir aqui.',
            `vera: ${SUMMARY_TEXT}`
        ]);
        expect(turn.effects).toEqual([{ type: 'modules', modules: { portfolio: true, spending: false } }]);
        expect(turn.messages[2]?.payload).toEqual({
            card: { type: 'summary' },
            chips: [{ id: 'dashboard', label: 'Ir para o painel', action: { type: 'GO_DASHBOARD' } }]
        });
        expect(ONBOARDING_SCRIPT.view(turn.state)).toEqual({
            status: 'done',
            step: 'done',
            remainingSteps: 0,
            pending: [{ key: 'setup.sources', label: 'Configuração: Investimentos' }]
        });
    });

    it('só gastos: Investimentos fica desligado e a pendência é de Gastos', () => {
        const { state, log } = run(ONBOARDING_SCRIPT, [{ type: 'CHOOSE_MODULES', portfolio: false, spending: true }]);

        expect(texts(log).slice(1, 3)).toEqual([
            'person: Meus gastos',
            'vera: Fechado. Investimentos fica desligado por enquanto; dá para ligar em Configurações › Módulos, ou é só me pedir aqui.'
        ]);
        expect(state.modules).toEqual({ portfolio: false, spending: true });
        expect(state.pending).toEqual([{ key: 'setup.spendPath', label: 'Configuração: Gastos' }]);
    });

    it('os dois: uma pendência por módulo, investimentos primeiro', () => {
        const { state, log } = run(ONBOARDING_SCRIPT, [{ type: 'CHOOSE_MODULES', portfolio: true, spending: true }]);

        expect(texts(log).slice(1, 3)).toEqual(['person: Os dois', 'vera: Fechado, os dois ligados. Começo pelos investimentos.']);
        expect(state.pending.map((item: { label: string }): string => item.label)).toEqual([
            'Configuração: Investimentos',
            'Configuração: Gastos'
        ]);
        expect(state.status).toBe('done');
    });

    it('"Ainda não sei" explica os módulos e oferece só as 3 escolhas', () => {
        const { state, log } = run(ONBOARDING_SCRIPT, [{ type: 'EXPLAIN' }]);

        expect(log[1]).toEqual({ role: 'person', text: 'Ainda não sei', payload: {} });
        expect(log[2]?.text.split('\n\n')).toEqual([
            'Sem problema. São dois módulos, e dá para ligar o outro quando quiser:',
            'Investimentos soma o que você tem em corretoras, no exterior e em cripto, numa moeda só, e compara com a divisão que você quer.',
            'Gastos traz o extrato do banco, separa por categoria e mostra onde dá para cortar para chegar numa meta.'
        ]);
        expect(chipIds(log[2])).toEqual(['modules.portfolio', 'modules.spending', 'modules.both']);
        expect(state.step).toBe('explain');
        expect(
            run(ONBOARDING_SCRIPT, [{ type: 'EXPLAIN' }, { type: 'CHOOSE_MODULES', portfolio: true, spending: false }]).state.status
        ).toBe('done');
    });

    it('fora do roteiro: pergunta solta recebe a resposta curta e os botões de antes', () => {
        const { state, log } = run(ONBOARDING_SCRIPT, [{ type: 'TEXT', text: 'quanto rendeu minha carteira?' }]);

        expect(texts(log.slice(1))).toEqual(['person: quanto rendeu minha carteira?', `vera: ${OFF_SCRIPT_TEXT}`]);
        expect(chipIds(log[2])).toEqual(['modules.portfolio', 'modules.spending', 'modules.both', 'modules.explain']);
        expect(state.chosen).toBe(false);
    });

    it.each([
        ['quero ligar gastos também', { portfolio: false, spending: true }],
        ['minha carteira de ações', { portfolio: true, spending: false }],
        ['os dois', { portfolio: true, spending: true }],
        ['investimentos e gastos', { portfolio: true, spending: true }]
    ])('palavras de módulo escolhem o módulo: "%s"', (text: string, modules: { portfolio: boolean; spending: boolean }) => {
        const { state, log } = run(ONBOARDING_SCRIPT, [{ type: 'TEXT', text }]);

        expect(log[1]).toEqual({ role: 'person', text, payload: {} });
        expect(state.modules).toEqual(modules);
        expect(state.status).toBe('done');
    });

    it('texto sem palavra de módulo nem pergunta recebe a resposta curta', () => {
        const { state, log } = run(ONBOARDING_SCRIPT, [{ type: 'TEXT', text: 'oi' }]);

        expect(log[2]?.text).toBe(OFF_SCRIPT_TEXT);
        expect(state.status).toBe('active');
    });

    it('"Continuar depois" pausa, "Retomar" volta à escolha e "Concluir agora" fecha com a pendência', () => {
        const { state, log } = run(ONBOARDING_SCRIPT, [{ type: 'SKIP' }, { type: 'RESUME' }, { type: 'FINISH_NOW' }]);

        expect(texts(log.slice(1))).toEqual([
            'person: Continuar depois',
            'vera: Tudo bem. Guardei a conversa e tudo o que você já fez. No painel fica um cartão para você continuar daqui, quando quiser.',
            'system: A pessoa vai para o painel. Cartão "Continuar configuração · 1 etapa pela frente".',
            'system: A pessoa tocou em "Continuar configuração" no painel. A conversa reabre com todo o histórico acima.',
            'vera: Que bom te ver de volta. Para começar: o que você quer acompanhar aqui?',
            'person: Concluir agora',
            `vera: ${CLOSED_WITH_PENDING}`,
            `vera: ${SUMMARY_TEXT}`
        ]);
        expect(chipIds(log[5])).toEqual(['modules.portfolio', 'modules.spending', 'modules.both', 'modules.explain']);
        expect(ONBOARDING_SCRIPT.view(state)).toEqual({
            status: 'done',
            step: 'done',
            remainingSteps: 1,
            pending: [{ key: 'setup.modules', label: 'Configuração: escolher o que acompanhar' }]
        });
    });

    it('"Continuar depois" deixa paused', () => {
        const { state } = run(ONBOARDING_SCRIPT, [{ type: 'SKIP' }]);

        expect(ONBOARDING_SCRIPT.view(state)).toMatchObject({ status: 'paused', step: 'modules', remainingSteps: 1 });
    });

    it('"Concluir agora" também fecha direto de uma pausa', () => {
        const { state } = run(ONBOARDING_SCRIPT, [{ type: 'SKIP' }, { type: 'FINISH_NOW' }]);

        expect(state.status).toBe('done');
        expect(state.pending).toEqual([{ key: 'setup.modules', label: 'Configuração: escolher o que acompanhar' }]);
    });

    it('"Retomar" depois de concluída avisa que a configuração já está concluída', () => {
        const { state, log } = run(ONBOARDING_SCRIPT, [{ type: 'CHOOSE_MODULES', portfolio: true, spending: false }, { type: 'RESUME' }]);

        expect(log.at(-1)?.text).toBe(
            'Sua configuração já está concluída. Se quiser ligar outro módulo ou mandar mais arquivos, é só pedir aqui.'
        );
        expect(state.status).toBe('done');
    });

    it('"Ir para o painel" só depois de concluir', () => {
        const { log } = run(ONBOARDING_SCRIPT, [{ type: 'FINISH_NOW' }, { type: 'GO_DASHBOARD' }]);

        expect(texts(log.slice(-2))).toEqual([
            'person: Ir para o painel',
            'system: A pessoa vai para a Visão geral. O que ficou pendente aparece num cartão "Continuar configuração".'
        ]);
    });

    it.each([
        ['quero concluir', 'done', 'person: Concluir agora'],
        ['vejo isso mais tarde', 'paused', 'person: Continuar depois']
    ])('texto "%s" vira o comando', (text: string, status: string, echo: string) => {
        const { state, log } = run(ONBOARDING_SCRIPT, [{ type: 'TEXT', text }]);

        expect(state.status).toBe(status);
        expect(texts(log)[1]).toBe(echo);
    });

    it('texto "depois" durante a pausa recebe a resposta curta', () => {
        const { state, log } = run(ONBOARDING_SCRIPT, [{ type: 'SKIP' }, { type: 'TEXT', text: 'depois' }]);

        expect(log.at(-1)?.text).toBe(OFF_SCRIPT_TEXT);
        expect(state.status).toBe('paused');
    });

    it.each<[string, readonly ScriptAction[], ScriptAction]>([
        ['CONFIRM_IMPORT sem prévia aberta', [], { type: 'CONFIRM_IMPORT' }],
        ['PICK_SOURCES antes de escolher', [], { type: 'PICK_SOURCES' }],
        ['SKIP já pausado', [{ type: 'SKIP' }], { type: 'SKIP' }],
        ['RESUME sem pausa', [], { type: 'RESUME' }],
        ['FINISH_NOW já concluído', [{ type: 'FINISH_NOW' }], { type: 'FINISH_NOW' }],
        ['GO_DASHBOARD antes de concluir', [], { type: 'GO_DASHBOARD' }],
        ['EXPLAIN de novo', [{ type: 'EXPLAIN' }], { type: 'EXPLAIN' }],
        [
            'CHOOSE_MODULES depois de escolher',
            [{ type: 'CHOOSE_MODULES', portfolio: true, spending: false }],
            { type: 'CHOOSE_MODULES', portfolio: false, spending: true }
        ]
    ])(
        'ação fora de hora responde onboarding.action_out_of_step: %s',
        (_label: string, before: readonly ScriptAction[], action: ScriptAction) => {
            const { state } = run(ONBOARDING_SCRIPT, before);

            expect(() => ONBOARDING_SCRIPT.reduce(state, action)).toThrow(OnboardingActionOutOfStepError);
        }
    );

    it('não muda o estado recebido', () => {
        const first: ScriptTurn = ONBOARDING_SCRIPT.initial('Marina');
        const frozen: ScriptState = Object.freeze({ ...first.state, plan: Object.freeze([]), pending: Object.freeze([]) });

        ONBOARDING_SCRIPT.reduce(frozen, { type: 'CHOOSE_MODULES', portfolio: true, spending: true });

        expect(frozen.status).toBe('active');
        expect(frozen.pending).toEqual([]);
    });
});

describe('OnboardingScript com uma etapa registrada (como farão o #396 e o #397)', () => {
    const sources: ScriptStepDefinition = {
        key: 'sources',
        label: 'Onde estão os investimentos',
        enter: (turn: ScriptTurn): ScriptTurn =>
            say(turn, 'Onde estão seus investimentos hoje? Pode marcar mais de um.', { card: { type: 'sources' } }),
        actions: {
            PICK_SOURCES: (turn: ScriptTurn, _action: ScriptAction, flow: ScriptFlow): ScriptTurn => flow.advance(say(turn, 'Seguindo.'))
        }
    };
    const script: OnboardingScript = new OnboardingScript([sources]);

    it('a escolha do módulo entra na etapa registrada em vez de virar pendência', () => {
        const { state, log } = run(script, [{ type: 'CHOOSE_MODULES', portfolio: true, spending: true }]);

        expect(log.at(-1)).toEqual({
            role: 'vera',
            text: 'Onde estão seus investimentos hoje? Pode marcar mais de um.',
            payload: { card: { type: 'sources' } }
        });
        expect(script.view(state)).toEqual({ status: 'active', step: 'sources', remainingSteps: 1, pending: [] });
    });

    it('a ação da etapa segue o plano; a etapa sem registro vira pendência', () => {
        const { state } = run(script, [{ type: 'CHOOSE_MODULES', portfolio: true, spending: true }, { type: 'PICK_SOURCES' }]);

        expect(state.status).toBe('done');
        expect(state.pending).toEqual([{ key: 'setup.spendPath', label: 'Configuração: Gastos' }]);
    });

    it('pausa no meio da etapa, retoma nela e conclui com uma pendência por etapa que faltou', () => {
        const paused: { state: ScriptState; log: ScriptMessage[] } = run(script, [
            { type: 'CHOOSE_MODULES', portfolio: true, spending: true },
            { type: 'SKIP' }
        ]);
        expect(paused.log.at(-1)?.text).toBe('A pessoa vai para o painel. Cartão "Continuar configuração · 2 etapas pela frente".');

        const resumed: ScriptTurn = script.reduce(paused.state, { type: 'RESUME' });
        expect(texts(resumed.messages).slice(1)).toEqual([
            'vera: Que bom te ver de volta. Continuo de onde paramos: Onde estão os investimentos.',
            'vera: Onde estão seus investimentos hoje? Pode marcar mais de um.'
        ]);

        const finished: ScriptTurn = script.reduce(resumed.state, { type: 'FINISH_NOW' });
        expect(finished.state.pending).toEqual([
            { key: 'setup.sources', label: 'Configuração: Onde estão os investimentos' },
            { key: 'setup.spendPath', label: 'Configuração: Gastos' }
        ]);
        expect(finished.messages[1]?.text).toBe(CLOSED_WITH_PENDING);
    });

    it('a ação da etapa fora dela responde fora de hora', () => {
        const { state } = run(script, [{ type: 'CHOOSE_MODULES', portfolio: true, spending: true }, { type: 'SKIP' }]);

        expect(() => script.reduce(state, { type: 'PICK_SOURCES' })).toThrow(OnboardingActionOutOfStepError);
    });
});
