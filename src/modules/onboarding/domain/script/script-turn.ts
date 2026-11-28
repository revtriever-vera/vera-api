import {
    PendingItem,
    SCRIPT_ROLES,
    ScriptEffect,
    ScriptMessage,
    ScriptPayload,
    ScriptRole,
    ScriptState,
    ScriptTurn,
    WELCOME_STEPS
} from './script.types';

const PARAGRAPH_SEPARATOR: string = '\n\n';

export function startTurn(state: ScriptState): ScriptTurn {
    return { state, messages: [], effects: [] };
}

export function withState(turn: ScriptTurn, patch: Partial<ScriptState>): ScriptTurn {
    return { ...turn, state: { ...turn.state, ...patch } };
}

export function say(turn: ScriptTurn, text: string | readonly string[], payload: ScriptPayload = {}): ScriptTurn {
    const pushed: ScriptTurn = push(turn, SCRIPT_ROLES.vera, text, payload);
    if (payload.chips === undefined) {
        return pushed;
    }
    return withState(pushed, { offered: payload.chips });
}

export function me(turn: ScriptTurn, text: string): ScriptTurn {
    return push(turn, SCRIPT_ROLES.person, text, {});
}

export function sys(turn: ScriptTurn, text: string): ScriptTurn {
    return push(turn, SCRIPT_ROLES.system, text, {});
}

export function addPending(turn: ScriptTurn, item: PendingItem): ScriptTurn {
    const known: Set<string> = new Set<string>(turn.state.pending.map((pending: PendingItem): string => pending.key));
    if (known.has(item.key)) {
        return turn;
    }
    return withState(turn, { pending: [...turn.state.pending, item] });
}

export function emit(turn: ScriptTurn, effect: ScriptEffect): ScriptTurn {
    return { ...turn, effects: [...turn.effects, effect] };
}

export function isWelcomeStep(step: string): boolean {
    return step === WELCOME_STEPS.modules || step === WELCOME_STEPS.explain;
}

function push(turn: ScriptTurn, role: ScriptRole, text: string | readonly string[], payload: ScriptPayload): ScriptTurn {
    const message: ScriptMessage = { role, text: ([] as string[]).concat(text).join(PARAGRAPH_SEPARATOR), payload };
    return { ...turn, messages: [...turn.messages, message] };
}
