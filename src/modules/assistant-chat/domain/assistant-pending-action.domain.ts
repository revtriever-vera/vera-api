import { Injectable } from '@nestjs/common';
import { JsonObject } from '../../../core/llm/llm.types';
import { AssistantPendingActionsRepository } from '../repositories/assistant-pending-actions.repository';
import { ActionStatus, AssistantPendingAction, ProposedAction } from './assistant-chat.types';

@Injectable()
export class AssistantPendingActionDomain {
    public constructor(private readonly actions: AssistantPendingActionsRepository) {}

    public async propose(action: ProposedAction, now: Date): Promise<AssistantPendingAction> {
        return this.actions.propose(action, now);
    }

    public async findOfUser(id: string, userId: string): Promise<AssistantPendingAction | null> {
        return this.actions.findOfUser(id, userId);
    }

    public async ofTurns(turnIds: readonly string[]): Promise<AssistantPendingAction[]> {
        return this.actions.ofTurns(turnIds);
    }

    public async claim(id: string, now: Date): Promise<AssistantPendingAction | null> {
        return this.actions.claim(id, now);
    }

    public async recordResult(id: string, resultText: string, payload: JsonObject): Promise<void> {
        await this.actions.recordResult(id, resultText, payload);
    }

    public async close(id: string, status: ActionStatus, now: Date): Promise<boolean> {
        return this.actions.close(id, status, now);
    }
}
