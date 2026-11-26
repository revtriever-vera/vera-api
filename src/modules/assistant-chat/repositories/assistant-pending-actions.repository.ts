import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { DatabaseClient } from '../../../core/database/database.client';
import { BareTenantRepository } from '../../../core/database/repositories/bare-tenant.repository';
import { JsonObject } from '../../../core/llm/llm.types';
import { IdUtil } from '../../../shared/utils/id.util';
import { ACTION_STATUSES, ACTION_TTL_MS, ActionStatus, AssistantPendingAction, ProposedAction } from '../domain/assistant-chat.types';

@Injectable()
export class AssistantPendingActionsRepository extends BareTenantRepository<'AssistantPendingActions'> {
    public constructor(database: DatabaseClient, context: AppContext) {
        super(database, context, 'AssistantPendingActions');
    }

    public async propose(action: ProposedAction, now: Date): Promise<AssistantPendingAction> {
        await this.updateManyRows(
            { conversationId: action.conversationId, status: ACTION_STATUSES.open },
            { status: ACTION_STATUSES.canceled, resolvedAt: now, updatedAt: now }
        );
        return this.createRow({
            id: IdUtil.newId(),
            companyId: this.companyId,
            userId: action.userId,
            conversationId: action.conversationId,
            turnId: action.turnId,
            tool: action.tool,
            summary: action.summary,
            payload: JSON.stringify(action.payload),
            actionHash: action.actionHash,
            stateHash: action.stateHash,
            status: ACTION_STATUSES.open,
            expiresAt: new Date(now.getTime() + ACTION_TTL_MS),
            createdAt: now,
            updatedAt: now
        });
    }

    public async findOfUser(id: string, userId: string): Promise<AssistantPendingAction | null> {
        return this.findOne({ id, userId });
    }

    public async ofTurns(turnIds: readonly string[]): Promise<AssistantPendingAction[]> {
        if (turnIds.length === 0) {
            return [];
        }
        return this.findMany({ turnId: turnIds }, { limit: turnIds.length });
    }

    public async claim(id: string, now: Date): Promise<AssistantPendingAction | null> {
        const rows: AssistantPendingAction[] = await this.updateManyRows(
            { id, status: ACTION_STATUSES.open, expiresAt: { '>': now } },
            { status: ACTION_STATUSES.confirmed, resolvedAt: now, updatedAt: now }
        );
        return rows[0] ?? null;
    }

    public async recordResult(id: string, resultText: string, payload: JsonObject): Promise<void> {
        await this.updateManyRows(
            { id, status: ACTION_STATUSES.confirmed },
            { resultText, payload: JSON.stringify(payload), updatedAt: new Date() }
        );
    }

    public async close(id: string, status: ActionStatus, now: Date): Promise<boolean> {
        const rows: AssistantPendingAction[] = await this.updateManyRows(
            { id, status: ACTION_STATUSES.open },
            { status, resolvedAt: now, updatedAt: now }
        );
        return rows.length > 0;
    }
}
