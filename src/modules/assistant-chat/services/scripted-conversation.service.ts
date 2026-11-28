import { Injectable } from '@nestjs/common';
import { AssistantConversation, AssistantMessage, ScriptedMessageInput as StoredScriptedMessage } from '../domain/assistant-chat.types';
import { AssistantConversationDomain } from '../domain/assistant-conversation.domain';
import { AssistantMessageDomain } from '../domain/assistant-message.domain';

export type ScriptedMessageInput = StoredScriptedMessage;

export interface ScriptedMessage {
    readonly id: string;
    readonly role: string;
    readonly text: string;
    readonly payload: unknown;
    readonly createdAt: Date;
}

export interface ScriptedConversation {
    readonly id: string;
    readonly createdAt: Date;
}

@Injectable()
export class ScriptedConversationService {
    public constructor(
        private readonly conversations: AssistantConversationDomain,
        private readonly messages: AssistantMessageDomain
    ) {}

    public async openOnboarding(userId: string, at: Date): Promise<ScriptedConversation> {
        const conversation: AssistantConversation = await this.conversations.openOnboarding(userId, at);
        return { id: conversation.id, createdAt: conversation.createdAt };
    }

    public async append(conversationId: string, messages: readonly ScriptedMessageInput[], at: Date): Promise<void> {
        if (messages.length === 0) {
            return;
        }
        await this.messages.appendScripted(conversationId, messages, at);
        await this.conversations.touch(conversationId, new Date(at.getTime() + messages.length));
    }

    public async history(conversationId: string): Promise<ScriptedMessage[]> {
        const rows: AssistantMessage[] = await this.messages.historyOf(conversationId);
        return rows.map((row: AssistantMessage): ScriptedMessage => ({
            id: row.id,
            role: row.role,
            text: row.text,
            payload: row.payload,
            createdAt: row.createdAt
        }));
    }
}
