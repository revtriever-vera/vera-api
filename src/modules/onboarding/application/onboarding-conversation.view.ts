import type { ScriptedMessage } from '../../assistant-chat/services/scripted-conversation.service';
import { SCRIPT_ROLES, ScriptModules, ScriptRole, ScriptView } from '../domain/script/script.types';
import {
    ConversationMessageView,
    OnboardingConversationView,
    StoredPayload,
    storedPayloadSchema
} from '../validation/onboarding-conversation.schemas';

export interface ConversationParts {
    readonly conversationId: string;
    readonly script: ScriptView;
    readonly modules: ScriptModules;
    readonly messages: readonly ScriptedMessage[];
}

function roleOf(role: string): ScriptRole {
    if (role === SCRIPT_ROLES.vera || role === SCRIPT_ROLES.system) {
        return role;
    }
    return SCRIPT_ROLES.person;
}

function payloadOf(raw: unknown, last: boolean): ConversationMessageView['payload'] {
    if (raw === null) {
        return undefined;
    }
    const parsed: StoredPayload = storedPayloadSchema.parse(raw);
    return { ...parsed, open: last && (parsed.chips !== undefined || parsed.card !== undefined) };
}

function messageViewOf(message: ScriptedMessage, last: boolean): ConversationMessageView {
    return {
        id: message.id,
        role: roleOf(message.role),
        text: message.text,
        createdAt: message.createdAt.toISOString(),
        payload: payloadOf(message.payload, last)
    };
}

export function conversationViewOf(parts: ConversationParts): OnboardingConversationView {
    const lastIndex: number = parts.messages.length - 1;
    return {
        conversationId: parts.conversationId,
        status: parts.script.status,
        step: parts.script.step,
        remainingSteps: parts.script.remainingSteps,
        modules: { portfolio: parts.modules.portfolio, spending: parts.modules.spending },
        pending: parts.script.pending.map((item: ScriptView['pending'][number]) => ({ key: item.key, label: item.label })),
        messages: parts.messages.map((message: ScriptedMessage, index: number): ConversationMessageView =>
            messageViewOf(message, index === lastIndex)
        )
    };
}
