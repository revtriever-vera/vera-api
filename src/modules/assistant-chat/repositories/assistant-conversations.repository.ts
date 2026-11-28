import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { DatabaseClient } from '../../../core/database/database.client';
import { BareTenantRepository } from '../../../core/database/repositories/bare-tenant.repository';
import { IdUtil } from '../../../shared/utils/id.util';
import { AssistantConversation, CONVERSATION_KINDS } from '../domain/assistant-chat.types';

const PURGE_BATCH: number = 500;
const EXPORT_LIMIT: number = 200;
const CHAT_ONLY: { readonly kind: string } = { kind: CONVERSATION_KINDS.chat };

@Injectable()
export class AssistantConversationsRepository extends BareTenantRepository<'AssistantConversations'> {
    public constructor(database: DatabaseClient, context: AppContext) {
        super(database, context, 'AssistantConversations');
    }

    public async open(userId: string, at: Date): Promise<AssistantConversation> {
        return this.createRow({ id: IdUtil.newId(), companyId: this.companyId, userId, createdAt: at, lastMessageAt: at });
    }

    public async openOnboarding(userId: string, at: Date): Promise<AssistantConversation> {
        const existing: AssistantConversation | null = await this.findOnboarding();
        if (existing) {
            return existing;
        }
        const inserted: AssistantConversation | undefined = await this.insertBuilder()
            .values({
                id: IdUtil.newId(),
                companyId: this.companyId,
                userId,
                kind: CONVERSATION_KINDS.onboarding,
                createdAt: at,
                lastMessageAt: at
            })
            .onConflict((conflict) => conflict.column('companyId').where('kind', '=', CONVERSATION_KINDS.onboarding).doNothing())
            .returningAll()
            .executeTakeFirst();
        return inserted ?? this.requireOnboarding();
    }

    public async findOnboarding(): Promise<AssistantConversation | null> {
        return this.findOne({ kind: CONVERSATION_KINDS.onboarding });
    }

    public async findOfUser(id: string, userId: string): Promise<AssistantConversation | null> {
        return this.findOne({ id, userId, kind: CONVERSATION_KINDS.chat });
    }

    public async latestOfUser(userId: string): Promise<AssistantConversation | null> {
        const rows: AssistantConversation[] = await this.findMany(
            { userId, kind: CONVERSATION_KINDS.chat },
            { limit: 1, orderBy: [{ property: 'lastMessageAt', direction: 'desc' }] }
        );
        return rows[0] ?? null;
    }

    public async touch(id: string, at: Date): Promise<void> {
        await this.updateRow(id, { lastMessageAt: at });
    }

    public async listOfUser(userId: string): Promise<AssistantConversation[]> {
        return this.findMany(
            { userId, kind: CONVERSATION_KINDS.chat },
            { limit: EXPORT_LIMIT, orderBy: [{ property: 'createdAt', direction: 'asc' }] }
        );
    }

    public async eraseById(id: string): Promise<void> {
        await this.hardDeleteWhere({ id }, PURGE_BATCH);
    }

    public async eraseOfUser(userId: string): Promise<number> {
        return this.hardDeleteWhere({ userId, kind: CONVERSATION_KINDS.chat }, PURGE_BATCH);
    }

    public async eraseAll(): Promise<number> {
        return this.hardDeleteWhere({}, PURGE_BATCH);
    }

    public async purgeIdleBefore(cutoff: Date): Promise<number> {
        let purged: number = 0;
        let removed: number = await this.hardDeleteBefore('lastMessageAt', cutoff, PURGE_BATCH, CHAT_ONLY);
        while (removed > 0) {
            purged += removed;
            removed = await this.hardDeleteBefore('lastMessageAt', cutoff, PURGE_BATCH, CHAT_ONLY);
        }
        return purged;
    }

    private async requireOnboarding(): Promise<AssistantConversation> {
        const row: AssistantConversation | null = await this.findOnboarding();
        if (!row) {
            throw new Error('Onboarding conversation missing after insert');
        }
        return row;
    }
}
