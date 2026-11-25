import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { AccountDataExporterPort } from '../../identity/services/account-data-exporter.port';
import {
    AssistantConversation,
    AssistantConversationExport,
    AssistantMessage,
    AssistantMessageExport
} from '../domain/assistant-chat.types';
import { AssistantConversationDomain } from '../domain/assistant-conversation.domain';
import { AssistantMessageDomain } from '../domain/assistant-message.domain';
import { toolsOf } from '../domain/turn-view';

export const ASSISTANT_CHAT_EXPORT_AREA: string = 'assistant_chat';

function messageExportOf(message: AssistantMessage): AssistantMessageExport {
    return {
        role: message.role,
        text: message.text,
        status: message.status,
        mode: message.mode,
        toolsUsed: toolsOf(message),
        createdAt: message.createdAt.toISOString()
    };
}

@Injectable()
export class AssistantChatExporter extends AccountDataExporterPort {
    public readonly area: string = ASSISTANT_CHAT_EXPORT_AREA;

    public constructor(
        private readonly conversations: AssistantConversationDomain,
        private readonly messages: AssistantMessageDomain,
        private readonly context: AppContext
    ) {
        super();
    }

    public async exportAll(): Promise<AssistantConversationExport[]> {
        const userId: string | undefined = this.context.getOrNull()?.userId;
        if (userId === undefined) {
            return [];
        }
        const rows: AssistantConversation[] = await this.conversations.listOfUser(userId);
        const messages: AssistantMessage[] = await this.messages.listOfConversations(
            rows.map((row: AssistantConversation): string => row.id)
        );
        const byConversation: Map<string, AssistantMessageExport[]> = new Map<string, AssistantMessageExport[]>();
        for (const message of messages) {
            byConversation.set(message.conversationId, [...(byConversation.get(message.conversationId) ?? []), messageExportOf(message)]);
        }
        return rows.map((row: AssistantConversation): AssistantConversationExport => ({
            createdAt: row.createdAt.toISOString(),
            messages: byConversation.get(row.id) ?? []
        }));
    }
}
