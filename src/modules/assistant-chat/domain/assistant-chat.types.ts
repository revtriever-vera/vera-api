import { Insertable, Selectable } from 'kysely';
import { AssistantConversations, AssistantMessages, AssistantPendingActions } from '../../../core/database/generated/database.types';
import { JsonObject } from '../../../core/llm/llm.types';
import type { AskVeraSent } from '../../ai-assistant/services/ask-vera.service';

export const MESSAGE_ROLES = { person: 'person', vera: 'vera' } as const;
export type MessageRole = (typeof MESSAGE_ROLES)[keyof typeof MESSAGE_ROLES];

export const MESSAGE_STATUSES = { pending: 'pending', done: 'done', failed: 'failed' } as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[keyof typeof MESSAGE_STATUSES];

export const TURN_MODES = { help: 'help', ai: 'ai' } as const;
export type TurnMode = (typeof TURN_MODES)[keyof typeof TURN_MODES];

export const ACCESS_STATES = { ok: 'ok', premiumRequired: 'premium_required', permissionRequired: 'permission_required' } as const;
export type AccessState = (typeof ACCESS_STATES)[keyof typeof ACCESS_STATES];

export const ACTION_STATUSES = { open: 'open', confirmed: 'confirmed', canceled: 'canceled', expired: 'expired', stale: 'stale' } as const;
export type ActionStatus = (typeof ACTION_STATUSES)[keyof typeof ACTION_STATUSES];

export const ACTION_TTL_MS: number = 30 * 60 * 1000;

export const MAX_TURN_CHARS: number = 1000;
export const CURRENT_MESSAGES_LIMIT: number = 20;
export const RETENTION_DAYS: number = 30;
export const TURN_TIMEOUT_MS: number = 3 * 60 * 1000;
export const TURNS_PER_HOUR: number = 20;
export const MAX_SCREEN_PATH_CHARS: number = 200;

export type AssistantConversation = Selectable<AssistantConversations>;
export type AssistantMessage = Selectable<AssistantMessages>;
export type NewAssistantMessage = Insertable<AssistantMessages>;
export type AssistantPendingAction = Selectable<AssistantPendingActions>;
export type NewAssistantPendingAction = Insertable<AssistantPendingActions>;

export interface ProposedAction {
    readonly userId: string;
    readonly conversationId: string;
    readonly turnId: string;
    readonly tool: string;
    readonly summary: string;
    readonly payload: JsonObject;
    readonly actionHash: string;
    readonly stateHash: string;
}

export interface StartedTurn {
    readonly conversationId: string;
    readonly questionId: string;
    readonly turnId: string;
    readonly newConversation: boolean;
}

export interface FinishTurnInput {
    readonly text: string;
    readonly mode: TurnMode;
    readonly toolsUsed: readonly string[];
    readonly sent: readonly AskVeraSent[] | null;
}

export interface TurnTrail {
    readonly turn: AssistantMessage;
    readonly question: AssistantMessage | null;
    readonly history: readonly AssistantMessage[];
}

export interface AssistantMessageExport {
    readonly role: string;
    readonly text: string;
    readonly status: string;
    readonly mode: string | null;
    readonly toolsUsed: readonly string[];
    readonly createdAt: string;
}

export interface AssistantConversationExport {
    readonly createdAt: string;
    readonly messages: readonly AssistantMessageExport[];
}
