import { OnboardingActionOutOfStepError } from '../onboarding.errors';
import { DASHBOARD_CHIP, moduleChips } from './script-chips';
import { textIntentsOf } from './script-text';
import { addPending, emit, isWelcomeStep, me, say, startTurn, sys, withState } from './script-turn';
import {
    DONE_STEP,
    MODULE_ENTRY_STEPS,
    PendingItem,
    SCRIPT_ACTION_TYPES,
    SCRIPT_STATUSES,
    SCRIPT_VERSION,
    ScriptAction,
    ScriptActionHandler,
    ScriptActionType,
    ScriptFlow,
    ScriptModules,
    ScriptState,
    ScriptStepDefinition,
    ScriptTurn,
    ScriptView,
    SKELETON_ACTION_TYPES,
    STEP_ACTION_TYPES,
    StepActionType,
    WELCOME_STEPS
} from './script.types';

type SkeletonActionType = (typeof SKELETON_ACTION_TYPES)[number];
type ChooseModules = Extract<ScriptAction, { type: 'CHOOSE_MODULES' }>;
type TextAction = Extract<ScriptAction, { type: 'TEXT' }>;

const FIXED_LABELS: Readonly<Record<string, string>> = {
    [WELCOME_STEPS.modules]: 'Escolher o que acompanhar',
    [WELCOME_STEPS.explain]: 'Explicar os módulos',
    [MODULE_ENTRY_STEPS.portfolio]: 'Investimentos',
    [MODULE_ENTRY_STEPS.spending]: 'Gastos',
    [DONE_STEP]: 'Pronto'
};

const CHOOSE_PENDING: PendingItem = { key: 'setup.modules', label: 'Configuração: escolher o que acompanhar' };

const ACCEPTS: Readonly<Record<SkeletonActionType, (state: ScriptState) => boolean>> = {
    CHOOSE_MODULES: (state: ScriptState): boolean => !state.chosen && state.status !== SCRIPT_STATUSES.done,
    EXPLAIN: (state: ScriptState): boolean => state.status === SCRIPT_STATUSES.active && state.step === WELCOME_STEPS.modules,
    SKIP: (state: ScriptState): boolean => state.status === SCRIPT_STATUSES.active,
    RESUME: (state: ScriptState): boolean => state.status !== SCRIPT_STATUSES.active,
    FINISH_NOW: (state: ScriptState): boolean => state.status !== SCRIPT_STATUSES.done,
    GO_DASHBOARD: (state: ScriptState): boolean => state.status === SCRIPT_STATUSES.done,
    TEXT: (): boolean => true
};

function isSkeletonActionType(type: ScriptActionType): type is SkeletonActionType {
    return (SKELETON_ACTION_TYPES as readonly string[]).includes(type);
}

function isStepActionType(type: ScriptActionType): type is StepActionType {
    return (STEP_ACTION_TYPES as readonly string[]).includes(type);
}

export function isScriptActionType(type: string): type is ScriptActionType {
    return (SCRIPT_ACTION_TYPES as readonly string[]).includes(type);
}

function planFor(modules: ScriptModules): string[] {
    const plan: string[] = [];
    if (modules.portfolio) {
        plan.push(MODULE_ENTRY_STEPS.portfolio);
    }
    if (modules.spending) {
        plan.push(MODULE_ENTRY_STEPS.spending);
    }
    return plan;
}

function choiceLabelOf(action: ChooseModules): string {
    if (action.portfolio && action.spending) {
        return 'Os dois';
    }
    return action.portfolio ? 'Meus investimentos' : 'Meus gastos';
}

function choiceAnswerOf(modules: ScriptModules): string {
    if (modules.portfolio && modules.spending) {
        return 'Fechado, os dois ligados. Começo pelos investimentos.';
    }
    const off: string = modules.portfolio ? 'Gastos' : 'Investimentos';
    return `Fechado. ${off} fica desligado por enquanto; dá para ligar em Configurações › Módulos, ou é só me pedir aqui.`;
}

function greetingOf(name: string | null): string {
    return name === null ? 'Oi!' : `Oi, ${name}!`;
}

function stepsWord(count: number): string {
    return count === 1 ? 'etapa' : 'etapas';
}

export class OnboardingScript implements ScriptFlow {
    private readonly steps: ReadonlyMap<string, ScriptStepDefinition>;

    public constructor(steps: readonly ScriptStepDefinition[]) {
        this.steps = new Map<string, ScriptStepDefinition>(
            steps.map((step: ScriptStepDefinition): [string, ScriptStepDefinition] => [step.key, step])
        );
    }

    public initial(name: string | null): ScriptTurn {
        const state: ScriptState = {
            version: SCRIPT_VERSION,
            status: SCRIPT_STATUSES.active,
            step: WELCOME_STEPS.modules,
            plan: [],
            chosen: false,
            modules: { portfolio: false, spending: false },
            pending: [],
            offered: null
        };
        return say(
            startTurn(state),
            [
                `${greetingOf(name)} Eu sou a Vera. Vou montar sua conta com você em poucos minutos.`,
                'Para começar: o que você quer acompanhar aqui?'
            ],
            { chips: moduleChips(true) }
        );
    }

    public reduce(state: ScriptState, action: ScriptAction): ScriptTurn {
        const turn: ScriptTurn = startTurn(state);
        const stepHandler: ScriptActionHandler | undefined = this.stepHandlerOf(state, action);
        if (stepHandler !== undefined) {
            return stepHandler(turn, action, this);
        }
        if (!this.accepts(state, action)) {
            throw new OnboardingActionOutOfStepError(action.type, state.step, state.status);
        }
        return this.runSkeleton(turn, action);
    }

    public view(state: ScriptState): ScriptView {
        return {
            status: state.status,
            step: state.status === SCRIPT_STATUSES.done ? DONE_STEP : state.step,
            remainingSteps: new Set<string>(state.plan).size + (state.chosen ? 0 : 1),
            pending: state.pending
        };
    }

    public advance(turn: ScriptTurn): ScriptTurn {
        const [next, ...rest] = turn.state.plan;
        if (next === undefined) {
            return this.finish(turn);
        }
        const planned: ScriptTurn = withState(turn, { plan: rest });
        const definition: ScriptStepDefinition | undefined = this.steps.get(next);
        if (definition !== undefined) {
            return definition.enter(withState(planned, { step: next }), this);
        }
        return this.advance(addPending(planned, this.pendingOf(next)));
    }

    private stepHandlerOf(state: ScriptState, action: ScriptAction): ScriptActionHandler | undefined {
        const type: ScriptActionType = action.type;
        if (state.status !== SCRIPT_STATUSES.active || !isStepActionType(type)) {
            return undefined;
        }
        return this.steps.get(state.step)?.actions[type];
    }

    private accepts(state: ScriptState, action: ScriptAction): boolean {
        const type: ScriptActionType = action.type;
        return isSkeletonActionType(type) && ACCEPTS[type](state);
    }

    private runSkeleton(turn: ScriptTurn, action: ScriptAction): ScriptTurn {
        switch (action.type) {
            case 'CHOOSE_MODULES':
                return this.chooseModules(turn, action);
            case 'EXPLAIN':
                return this.explain(turn);
            case 'SKIP':
                return this.skip(turn);
            case 'RESUME':
                return this.resume(turn);
            case 'FINISH_NOW':
                return this.finishNow(turn);
            case 'GO_DASHBOARD':
                return this.goDashboard(turn);
            case 'TEXT':
                return this.text(turn, action);
            default:
                throw new OnboardingActionOutOfStepError(action.type, turn.state.step, turn.state.status);
        }
    }

    private chooseModules(turn: ScriptTurn, action: ChooseModules): ScriptTurn {
        const modules: ScriptModules = { portfolio: action.portfolio, spending: action.spending };
        const answered: ScriptTurn = me(turn, action.typed ?? choiceLabelOf(action));
        const chosen: ScriptTurn = withState(answered, { modules, chosen: true, status: SCRIPT_STATUSES.active });
        const said: ScriptTurn = say(emit(chosen, { type: 'modules', modules }), choiceAnswerOf(modules));
        return this.advance(withState(said, { plan: planFor(modules) }));
    }

    private explain(turn: ScriptTurn): ScriptTurn {
        const answered: ScriptTurn = withState(me(turn, 'Ainda não sei'), { step: WELCOME_STEPS.explain });
        return say(
            answered,
            [
                'Sem problema. São dois módulos, e dá para ligar o outro quando quiser:',
                'Investimentos soma o que você tem em corretoras, no exterior e em cripto, numa moeda só, e compara com a divisão que você quer.',
                'Gastos traz o extrato do banco, separa por categoria e mostra onde dá para cortar para chegar numa meta.'
            ],
            { chips: moduleChips(false) }
        );
    }

    private skip(turn: ScriptTurn): ScriptTurn {
        const state: ScriptState = turn.state;
        const plan: readonly string[] = isWelcomeStep(state.step) ? state.plan : [state.step, ...state.plan];
        const paused: ScriptTurn = withState(me(turn, 'Continuar depois'), { status: SCRIPT_STATUSES.paused, plan });
        const said: ScriptTurn = say(
            paused,
            'Tudo bem. Guardei a conversa e tudo o que você já fez. No painel fica um cartão para você continuar daqui, quando quiser.'
        );
        const remaining: number = this.view(said.state).remainingSteps;
        return sys(
            said,
            `A pessoa vai para o painel. Cartão "Continuar configuração · ${String(remaining)} ${stepsWord(remaining)} pela frente".`
        );
    }

    private resume(turn: ScriptTurn): ScriptTurn {
        const state: ScriptState = turn.state;
        const reopened: ScriptTurn = sys(
            turn,
            'A pessoa tocou em "Continuar configuração" no painel. A conversa reabre com todo o histórico acima.'
        );
        if (!state.chosen) {
            return this.reopenChoice(reopened);
        }
        if (state.status === SCRIPT_STATUSES.done) {
            return say(
                reopened,
                'Sua configuração já está concluída. Se quiser ligar outro módulo ou mandar mais arquivos, é só pedir aqui.'
            );
        }
        return this.continuePlan(reopened);
    }

    private reopenChoice(turn: ScriptTurn): ScriptTurn {
        return say(
            withState(turn, { status: SCRIPT_STATUSES.active, step: WELCOME_STEPS.modules }),
            'Que bom te ver de volta. Para começar: o que você quer acompanhar aqui?',
            { chips: moduleChips(true) }
        );
    }

    private continuePlan(reopened: ScriptTurn): ScriptTurn {
        const next: string | undefined = reopened.state.plan[0];
        const where: string = next === undefined ? 'o próximo passo' : this.labelOf(next);
        const said: ScriptTurn = say(
            withState(reopened, { status: SCRIPT_STATUSES.active }),
            `Que bom te ver de volta. Continuo de onde paramos: ${where}.`
        );
        return this.advance(said);
    }

    private finishNow(turn: ScriptTurn): ScriptTurn {
        const state: ScriptState = turn.state;
        const current: readonly string[] = isWelcomeStep(state.step) || state.step === DONE_STEP ? [] : [state.step];
        const left: readonly string[] = [
            ...new Set<string>(state.status === SCRIPT_STATUSES.paused ? state.plan : [...current, ...state.plan])
        ];
        const listed: ScriptTurn = left.reduce(
            (acc: ScriptTurn, step: string): ScriptTurn => addPending(acc, this.pendingOf(step)),
            me(turn, 'Concluir agora')
        );
        const withChoice: ScriptTurn = state.chosen ? listed : addPending(listed, CHOOSE_PENDING);
        const closing: string =
            left.length > 0 || !state.chosen
                ? 'Fechado. Concluí com o que já temos; o que faltou fica como pendência no painel, e você pode me chamar para seguir quando quiser.'
                : 'Fechado.';
        return this.finish(say(withState(withChoice, { plan: [] }), closing));
    }

    private goDashboard(turn: ScriptTurn): ScriptTurn {
        return sys(
            me(turn, 'Ir para o painel'),
            'A pessoa vai para a Visão geral. O que ficou pendente aparece num cartão "Continuar configuração".'
        );
    }

    private text(turn: ScriptTurn, action: TextAction): ScriptTurn {
        const text: string = action.text.trim();
        const intent: ScriptAction | undefined = textIntentsOf(turn.state, text).find((candidate: ScriptAction): boolean =>
            this.accepts(turn.state, candidate)
        );
        if (intent !== undefined) {
            return this.runSkeleton(turn, intent);
        }
        const offered: ScriptTurn['state']['offered'] = turn.state.offered;
        return say(
            me(turn, text),
            [
                'Aqui eu sigo um roteiro curto para montar a conta, então ainda não respondo perguntas soltas.',
                'Escolhe uma das opções acima ou manda o arquivo. Sua pergunta eu respondo no Perguntar à Vera, depois da configuração.'
            ],
            offered === null ? {} : { chips: offered }
        );
    }

    private finish(turn: ScriptTurn): ScriptTurn {
        const done: ScriptTurn = withState(turn, { step: DONE_STEP, status: SCRIPT_STATUSES.done, plan: [] });
        return say(done, 'Pronto, sua conta está montada. Aqui está o que ficou:', { card: { type: 'summary' }, chips: [DASHBOARD_CHIP] });
    }

    private pendingOf(step: string): PendingItem {
        return { key: `setup.${step}`, label: `Configuração: ${this.labelOf(step)}` };
    }

    private labelOf(step: string): string {
        return this.steps.get(step)?.label ?? FIXED_LABELS[step] ?? step;
    }
}
