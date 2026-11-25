import { Insertable, Selectable } from 'kysely';
import { AssistantConversations, AssistantMessages } from '../../../core/database/generated/database.types';
import type { AskVeraSent } from '../../ai-assistant/services/ask-vera.service';

export const MESSAGE_ROLES = { person: 'person', vera: 'vera' } as const;
export type MessageRole = (typeof MESSAGE_ROLES)[keyof typeof MESSAGE_ROLES];

export const MESSAGE_STATUSES = { pending: 'pending', done: 'done', failed: 'failed' } as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[keyof typeof MESSAGE_STATUSES];

export const TURN_MODES = { help: 'help', ai: 'ai' } as const;
export type TurnMode = (typeof TURN_MODES)[keyof typeof TURN_MODES];

export const ACCESS_STATES = { ok: 'ok', premiumRequired: 'premium_required', permissionRequired: 'permission_required' } as const;
export type AccessState = (typeof ACCESS_STATES)[keyof typeof ACCESS_STATES];

export const MAX_TURN_CHARS: number = 1000;
export const CURRENT_MESSAGES_LIMIT: number = 20;
export const RETENTION_DAYS: number = 30;
export const TURN_TIMEOUT_MS: number = 3 * 60 * 1000;
export const TURNS_PER_HOUR: number = 20;
export const MAX_SCREEN_PATH_CHARS: number = 200;

export type AssistantConversation = Selectable<AssistantConversations>;
export type AssistantMessage = Selectable<AssistantMessages>;
export type NewAssistantMessage = Insertable<AssistantMessages>;

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
