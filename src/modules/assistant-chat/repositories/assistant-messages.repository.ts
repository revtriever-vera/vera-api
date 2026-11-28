import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { DatabaseClient } from '../../../core/database/database.client';
import { BareTenantRepository } from '../../../core/database/repositories/bare-tenant.repository';
import { IdUtil } from '../../../shared/utils/id.util';
import {
    AssistantMessage,
    FinishTurnInput,
    MESSAGE_ROLES,
    MESSAGE_STATUSES,
    NewAssistantMessage,
    ScriptedMessageInput,
    TurnMode
} from '../domain/assistant-chat.types';

const PURGE_BATCH: number = 500;
const EXPORT_LIMIT: number = 2000;
const UNSCRIPTED: { readonly payload: null } = { payload: null };

@Injectable()
export class AssistantMessagesRepository extends BareTenantRepository<'AssistantMessages'> {
    public constructor(database: DatabaseClient, context: AppContext) {
        super(database, context, 'AssistantMessages');
    }

    public async startTurn(
        conversationId: string,
        text: string,
        mode: TurnMode,
        at: Date
    ): Promise<{ questionId: string; turnId: string }> {
        const questionId: string = IdUtil.newId();
        const turnId: string = IdUtil.newId();
        await this.createManyRows([
            this.rowOf({ id: questionId, conversationId, role: MESSAGE_ROLES.person, status: MESSAGE_STATUSES.done, text, mode: null }, at),
            this.rowOf(
                { id: turnId, conversationId, role: MESSAGE_ROLES.vera, status: MESSAGE_STATUSES.pending, text: '', mode },
                new Date(at.getTime() + 1)
            )
        ]);
        return { questionId, turnId };
    }

    public async findTurn(id: string): Promise<AssistantMessage | null> {
        return this.findOne({ id, role: MESSAGE_ROLES.vera });
    }

    public async findQuestion(id: string): Promise<AssistantMessage | null> {
        return this.findOne({ id, role: MESSAGE_ROLES.person });
    }

    public async latestOf(conversationId: string, limit: number): Promise<AssistantMessage[]> {
        const rows: AssistantMessage[] = await this.findMany(
            { conversationId },
            {
                limit,
                orderBy: [
                    { property: 'createdAt', direction: 'desc' },
                    { property: 'id', direction: 'desc' }
                ]
            }
        );
        return rows.reverse();
    }

    public async answeredBefore(conversationId: string, before: Date, limit: number): Promise<AssistantMessage[]> {
        const rows: AssistantMessage[] = await this.findMany(
            { conversationId, status: MESSAGE_STATUSES.done, createdAt: { '<': before } },
            {
                limit,
                orderBy: [
                    { property: 'createdAt', direction: 'desc' },
                    { property: 'id', direction: 'desc' }
                ]
            }
        );
        return rows.reverse();
    }

    public async finish(id: string, input: FinishTurnInput): Promise<boolean> {
        const rows: AssistantMessage[] = await this.updateManyRows(
            { id, status: MESSAGE_STATUSES.pending },
            {
                status: MESSAGE_STATUSES.done,
                text: input.text,
                mode: input.mode,
                toolsUsed: JSON.stringify(input.toolsUsed),
                sent: input.sent === null ? null : JSON.stringify(input.sent),
                updatedAt: new Date()
            }
        );
        return rows.length > 0;
    }

    public async fail(id: string, mode: TurnMode): Promise<boolean> {
        const rows: AssistantMessage[] = await this.updateManyRows(
            { id, status: MESSAGE_STATUSES.pending },
            { status: MESSAGE_STATUSES.failed, mode, updatedAt: new Date() }
        );
        return rows.length > 0;
    }

    public async eraseSent(): Promise<number> {
        const rows: AssistantMessage[] = await this.updateManyRows({}, { sent: null });
        return rows.length;
    }

    public async discard(ids: readonly string[]): Promise<void> {
        await this.hardDeleteWhere({ id: ids }, PURGE_BATCH);
    }

    public async listOfConversations(conversationIds: readonly string[]): Promise<AssistantMessage[]> {
        if (conversationIds.length === 0) {
            return [];
        }
        return this.findMany(
            { conversationId: conversationIds },
            { limit: EXPORT_LIMIT, orderBy: [{ property: 'createdAt', direction: 'asc' }] }
        );
    }

    public async purgeBefore(cutoff: Date): Promise<number> {
        let purged: number = 0;
        let removed: number = await this.hardDeleteBefore('createdAt', cutoff, PURGE_BATCH, UNSCRIPTED);
        while (removed > 0) {
            purged += removed;
            removed = await this.hardDeleteBefore('createdAt', cutoff, PURGE_BATCH, UNSCRIPTED);
        }
        return purged;
    }

    public async appendScripted(conversationId: string, messages: readonly ScriptedMessageInput[], at: Date): Promise<void> {
        if (messages.length === 0) {
            return;
        }
        await this.createManyRows(
            messages.map((message: ScriptedMessageInput, index: number): NewAssistantMessage => ({
                ...this.rowOf(
                    {
                        id: IdUtil.newId(),
                        conversationId,
                        role: message.role,
                        status: MESSAGE_STATUSES.done,
                        text: message.text,
                        mode: null
                    },
                    new Date(at.getTime() + index)
                ),
                payload: JSON.stringify(message.payload)
            }))
        );
    }

    public async historyOf(conversationId: string): Promise<AssistantMessage[]> {
        return this.findMany(
            { conversationId },
            {
                limit: EXPORT_LIMIT,
                orderBy: [
                    { property: 'createdAt', direction: 'asc' },
                    { property: 'id', direction: 'asc' }
                ]
            }
        );
    }

    private rowOf(
        values: { id: string; conversationId: string; role: string; status: string; text: string; mode: TurnMode | null },
        at: Date
    ): NewAssistantMessage {
        return { ...values, companyId: this.companyId, createdAt: at, updatedAt: at };
    }
}
