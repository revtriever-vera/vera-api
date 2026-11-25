import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { TurnNotFoundError } from '../domain/assistant-chat.errors';
import {
    AssistantConversation,
    AssistantMessage,
    CURRENT_MESSAGES_LIMIT,
    MESSAGE_STATUSES,
    RETENTION_DAYS,
    TurnMode
} from '../domain/assistant-chat.types';
import { AssistantConversationDomain } from '../domain/assistant-conversation.domain';
import { AssistantMessageDomain } from '../domain/assistant-message.domain';
import { retentionCutoffOf, splitNotice, toolsOf } from '../domain/turn-view';
import { AssistantAccessService } from '../services/assistant-access.service';
import { AssistantChatLogService } from '../services/assistant-chat-log.service';
import { AssistantTurnExpiry } from '../services/assistant-turn.expiry';
import { ConversationView } from '../validation/assistant-chat.schemas';

type MessageView = ConversationView['messages'][number];

@Injectable()
export class AssistantConversationApplication {
    public constructor(
        private readonly conversations: AssistantConversationDomain,
        private readonly messages: AssistantMessageDomain,
        private readonly access: AssistantAccessService,
        private readonly expiry: AssistantTurnExpiry,
        private readonly context: AppContext,
        private readonly logs: AssistantChatLogService
    ) {}

    public async current(): Promise<ConversationView> {
        const mode: TurnMode = await this.access.modeOf();
        const usage: ConversationView['usage'] = await this.access.usageOf(mode);
        const conversation: AssistantConversation | null = await this.conversations.latestOfUser(this.userId());
        if (conversation === null) {
            return { conversationId: null, messages: [], usage };
        }
        const rows: AssistantMessage[] = await this.messages.latestOf(conversation.id, CURRENT_MESSAGES_LIMIT);
        const settled: AssistantMessage[] = await Promise.all(rows.map(async (row: AssistantMessage) => this.expiry.settled(row)));
        return { conversationId: conversation.id, messages: settled.map((row: AssistantMessage): MessageView => this.viewOf(row)), usage };
    }

    public async remove(conversationId: string): Promise<void> {
        const owned: AssistantConversation | null = await this.conversations.findOfUser(conversationId, this.userId());
        if (owned === null) {
            throw new TurnNotFoundError();
        }
        await this.conversations.erase(owned.id);
    }

    public async purgeExpired(): Promise<number> {
        const cutoff: Date = retentionCutoffOf(new Date(), RETENTION_DAYS);
        const conversations: number = await this.conversations.purgeIdleBefore(cutoff);
        const messages: number = await this.messages.purgeBefore(cutoff);
        this.logs.retention(conversations, messages);
        return conversations + messages;
    }

    private viewOf(row: AssistantMessage): MessageView {
        const split: { text: string; notice: string | null } = splitNotice(row.text);
        const done: boolean = row.status === MESSAGE_STATUSES.done;
        return {
            id: row.id,
            role: row.role as MessageView['role'],
            text: split.text,
            status: row.status as MessageView['status'],
            toolsUsed: toolsOf(row),
            notice: done ? split.notice : null,
            createdAt: row.createdAt.toISOString()
        };
    }

    private userId(): string {
        const userId: string | undefined = this.context.get().userId;
        if (userId === undefined) {
            throw new TurnNotFoundError();
        }
        return userId;
    }
}
