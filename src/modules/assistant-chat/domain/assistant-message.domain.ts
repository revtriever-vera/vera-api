import { Injectable } from '@nestjs/common';
import { AssistantMessagesRepository } from '../repositories/assistant-messages.repository';
import { AssistantMessage, AssistantPendingAction, FinishTurnInput, TurnMode } from './assistant-chat.types';
import { AssistantPendingActionDomain } from './assistant-pending-action.domain';

@Injectable()
export class AssistantMessageDomain {
    public constructor(
        private readonly messages: AssistantMessagesRepository,
        private readonly pending: AssistantPendingActionDomain
    ) {}

    public async actionsOfTurns(turnIds: readonly string[]): Promise<AssistantPendingAction[]> {
        return this.pending.ofTurns(turnIds);
    }

    public async startTurn(
        conversationId: string,
        text: string,
        mode: TurnMode,
        at: Date
    ): Promise<{ questionId: string; turnId: string }> {
        return this.messages.startTurn(conversationId, text, mode, at);
    }

    public async findTurn(id: string): Promise<AssistantMessage | null> {
        return this.messages.findTurn(id);
    }

    public async findQuestion(id: string): Promise<AssistantMessage | null> {
        return this.messages.findQuestion(id);
    }

    public async latestOf(conversationId: string, limit: number): Promise<AssistantMessage[]> {
        return this.messages.latestOf(conversationId, limit);
    }

    public async answeredBefore(conversationId: string, before: Date, limit: number): Promise<AssistantMessage[]> {
        return this.messages.answeredBefore(conversationId, before, limit);
    }

    public async finish(id: string, input: FinishTurnInput): Promise<boolean> {
        return this.messages.finish(id, input);
    }

    public async fail(id: string, mode: TurnMode): Promise<boolean> {
        return this.messages.fail(id, mode);
    }

    public async eraseSent(): Promise<number> {
        return this.messages.eraseSent();
    }

    public async discard(ids: readonly string[]): Promise<void> {
        await this.messages.discard(ids);
    }

    public async listOfConversations(conversationIds: readonly string[]): Promise<AssistantMessage[]> {
        return this.messages.listOfConversations(conversationIds);
    }

    public async purgeBefore(cutoff: Date): Promise<number> {
        return this.messages.purgeBefore(cutoff);
    }
}
