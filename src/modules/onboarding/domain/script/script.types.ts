export const SCRIPT_VERSION = 1;

export const SCRIPT_STATUSES = { active: 'active', paused: 'paused', done: 'done' } as const;
export type ScriptStatus = (typeof SCRIPT_STATUSES)[keyof typeof SCRIPT_STATUSES];

export const WELCOME_STEPS = { modules: 'modules', explain: 'explain' } as const;
export const DONE_STEP = 'done';

export const SCRIPT_MODULES = { portfolio: 'portfolio', spending: 'spending' } as const;
export type ScriptModule = (typeof SCRIPT_MODULES)[keyof typeof SCRIPT_MODULES];

export const MODULE_ENTRY_STEPS = { portfolio: 'sources', spending: 'spendPath' } as const;

export const SCRIPT_ROLES = { vera: 'vera', person: 'person', system: 'system' } as const;
export type ScriptRole = (typeof SCRIPT_ROLES)[keyof typeof SCRIPT_ROLES];

export const SKELETON_ACTION_TYPES = ['CHOOSE_MODULES', 'EXPLAIN', 'SKIP', 'RESUME', 'FINISH_NOW', 'GO_DASHBOARD', 'TEXT'] as const;

export const STEP_ACTION_TYPES = [
    'PICK_SOURCES',
    'PICK_BROKER',
    'PICK_EXCHANGE',
    'PICK_BANK',
    'NO_FILE',
    'CONSENT',
    'CONFIRM_IMPORT',
    'FIX_IMPORT',
    'CONFIRM_STATEMENT',
    'BANK_FIXED',
    'TARGET',
    'SPEND_PATH',
    'CREDENTIALS_SAVED',
    'PLUGGY_CONNECTED',
    'PLUGGY_RANGE',
    'REVIEW_UNCATEGORIZED',
    'GOAL',
    'ENABLE_MODULE',
    'CONFIGURE_MODULE'
] as const;

export type StepActionType = (typeof STEP_ACTION_TYPES)[number];

export const SCRIPT_ACTION_TYPES = [...SKELETON_ACTION_TYPES, ...STEP_ACTION_TYPES] as const;
export type ScriptActionType = (typeof SCRIPT_ACTION_TYPES)[number];

export const SCRIPT_CARD_TYPES = [
    'sources',
    'upload',
    'review',
    'consent',
    'fixedIncome',
    'credentials',
    'pluggyConnect',
    'summary'
] as const;
export type ScriptCardType = (typeof SCRIPT_CARD_TYPES)[number];

export const MAX_SCRIPT_TEXT_CHARS = 1000;

export interface ScriptModules {
    readonly portfolio: boolean;
    readonly spending: boolean;
}

export const SIMPLE_ACTION_TYPES = ['EXPLAIN', 'SKIP', 'RESUME', 'FINISH_NOW', 'GO_DASHBOARD', ...STEP_ACTION_TYPES] as const;
export type SimpleActionType = (typeof SIMPLE_ACTION_TYPES)[number];

export type ScriptAction =
    | { readonly type: 'CHOOSE_MODULES'; readonly portfolio: boolean; readonly spending: boolean; readonly typed?: string }
    | { readonly type: 'TEXT'; readonly text: string }
    | { readonly type: SimpleActionType };

export interface ScriptChip {
    readonly id: string;
    readonly label: string;
    readonly quiet?: boolean;
    readonly action: ScriptAction;
}

export interface ScriptCard {
    readonly type: ScriptCardType;
}

export interface ScriptPayload {
    readonly chips?: readonly ScriptChip[];
    readonly card?: ScriptCard;
}

export interface ScriptMessage {
    readonly role: ScriptRole;
    readonly text: string;
    readonly payload: ScriptPayload;
}

export interface PendingItem {
    readonly key: string;
    readonly label: string;
}

export interface ScriptState {
    readonly version: typeof SCRIPT_VERSION;
    readonly status: ScriptStatus;
    readonly step: string;
    readonly plan: readonly string[];
    readonly chosen: boolean;
    readonly modules: ScriptModules;
    readonly pending: readonly PendingItem[];
    readonly offered: readonly ScriptChip[] | null;
}

export type ScriptEffect = { readonly type: 'modules'; readonly modules: ScriptModules };

export interface ScriptTurn {
    readonly state: ScriptState;
    readonly messages: readonly ScriptMessage[];
    readonly effects: readonly ScriptEffect[];
}

export interface ScriptFlow {
    advance(turn: ScriptTurn): ScriptTurn;
}

export type ScriptActionHandler = (turn: ScriptTurn, action: ScriptAction, flow: ScriptFlow) => ScriptTurn;

export interface ScriptStepDefinition {
    readonly key: string;
    readonly label: string;
    readonly enter: (turn: ScriptTurn, flow: ScriptFlow) => ScriptTurn;
    readonly actions: Partial<Record<StepActionType, ScriptActionHandler>>;
}

export interface ScriptView {
    readonly status: ScriptStatus;
    readonly step: string;
    readonly remainingSteps: number;
    readonly pending: readonly PendingItem[];
}
