import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { UsingTransaction } from '../../../core/database/using-transaction.decorator';
import { JsonObject } from '../../../core/llm/llm.types';
import type { AskVeraProposal } from '../../ai-assistant/services/ask-vera.service';
import { actionHashOf, stateHashOf } from '../domain/action-hash';
import { actionSummaryOf, statusOf } from '../domain/action-view';
import { ActionExpiredError, ActionNotFoundError, ActionResolvedError } from '../domain/assistant-chat.errors';
import { ACTION_STATUSES, AssistantMessage, AssistantPendingAction } from '../domain/assistant-chat.types';
import { AssistantPendingActionDomain } from '../domain/assistant-pending-action.domain';
import { ActionCandidate, ActionOutcome, AssistantActionExecutorPort } from './assistant-action-executor.port';
import { ActionAlwaysNotApplicableError, ConfirmationStaleError } from './assistant-action.errors';
import { AssistantActionRegistry } from './assistant-action.registry';
import { AssistantChatLogService } from './assistant-chat-log.service';
import { ActionSummaryView, ActionView, ConfirmActionBody } from '../validation/assistant-chat.schemas';

function referencedPayload(payload: JsonObject, outcome: ActionOutcome): JsonObject {
    return outcome.reference === null ? payload : { ...payload, reference: outcome.reference };
}

@Injectable()
export class AssistantActionService {
    public constructor(
        private readonly actions: AssistantPendingActionDomain,
        private readonly registry: AssistantActionRegistry,
        private readonly context: AppContext,
        private readonly logs: AssistantChatLogService
    ) {}

    public async propose(turn: AssistantMessage, proposal: AskVeraProposal): Promise<AssistantPendingAction | null> {
        const executor: AssistantActionExecutorPort | null = this.registry.executorFor(proposal.tool);
        const userId: string | undefined = this.context.get().userId;
        if (executor === null || userId === undefined) {
            return null;
        }
        return this.actions.propose(
            {
                userId,
                conversationId: turn.conversationId,
                turnId: turn.id,
                tool: proposal.tool,
                summary: proposal.summary,
                payload: proposal.payload,
                actionHash: actionHashOf(proposal.tool, proposal.payload),
                stateHash: stateHashOf(await executor.stateOf(proposal.payload))
            },
            new Date()
        );
    }

    public async view(id: string): Promise<ActionView> {
        const action: AssistantPendingAction = await this.owned(id);
        const now: Date = new Date();
        const summary: ActionSummaryView = actionSummaryOf(action, now);
        const executor: AssistantActionExecutorPort | null = this.registry.executorFor(action.tool);
        if (summary.status !== ACTION_STATUSES.open || executor === null) {
            return { ...summary, always: executor?.alwaysOf(action.payload as JsonObject) ?? null, candidates: [], importPreview: null };
        }
        const payload: JsonObject = action.payload as JsonObject;
        const candidates: readonly ActionCandidate[] = await executor.candidates(payload);
        const importPreview: JsonObject | null = await executor.preview(payload);
        return { ...summary, always: executor.alwaysOf(payload), candidates: [...candidates], importPreview };
    }

    public async confirm(id: string, body: ConfirmActionBody): Promise<ActionSummaryView> {
        const action: AssistantPendingAction = await this.owned(id);
        this.assertOpen(action);
        const executor: AssistantActionExecutorPort = this.executorOf(action);
        if (body.always !== undefined && executor.alwaysOf(action.payload as JsonObject) === null) {
            throw new ActionAlwaysNotApplicableError();
        }
        try {
            await this.assertFresh(action, executor);
            const outcome: ActionOutcome = await this.run(action, executor, body);
            this.logs.actionConfirmed(action.id, action.tool);
            const done: AssistantPendingAction = { ...action, status: ACTION_STATUSES.confirmed, resultText: outcome.text };
            return actionSummaryOf({ ...done, payload: referencedPayload(action.payload as JsonObject, outcome) }, new Date());
        } catch (error: unknown) {
            if (error instanceof ConfirmationStaleError) {
                await this.actions.close(action.id, ACTION_STATUSES.stale, new Date());
                this.logs.actionStale(action.id, action.tool);
            }
            throw error;
        }
    }

    public async cancel(id: string): Promise<ActionSummaryView> {
        const action: AssistantPendingAction = await this.owned(id);
        this.assertOpen(action);
        const now: Date = new Date();
        if (!(await this.actions.close(action.id, ACTION_STATUSES.canceled, now))) {
            throw new ActionResolvedError();
        }
        return actionSummaryOf({ ...action, status: ACTION_STATUSES.canceled }, now);
    }

    @UsingTransaction()
    private async run(
        action: AssistantPendingAction,
        executor: AssistantActionExecutorPort,
        body: ConfirmActionBody
    ): Promise<ActionOutcome> {
        const claimed: AssistantPendingAction | null = await this.actions.claim(action.id, new Date());
        if (claimed === null) {
            throw new ActionResolvedError();
        }
        const outcome: ActionOutcome = await executor.execute(action.payload as JsonObject, body);
        await this.actions.recordResult(action.id, outcome.text, referencedPayload(action.payload as JsonObject, outcome));
        return outcome;
    }

    private async assertFresh(action: AssistantPendingAction, executor: AssistantActionExecutorPort): Promise<void> {
        const payload: JsonObject = action.payload as JsonObject;
        const intact: boolean = actionHashOf(action.tool, payload) === action.actionHash;
        const unchanged: boolean = stateHashOf(await executor.stateOf(payload)) === action.stateHash;
        if (!intact || !unchanged) {
            throw new ConfirmationStaleError();
        }
    }

    private assertOpen(action: AssistantPendingAction): void {
        const status: string = statusOf(action, new Date());
        if (status === ACTION_STATUSES.expired) {
            throw new ActionExpiredError();
        }
        if (status !== ACTION_STATUSES.open) {
            throw new ActionResolvedError();
        }
    }

    private executorOf(action: AssistantPendingAction): AssistantActionExecutorPort {
        const executor: AssistantActionExecutorPort | null = this.registry.executorFor(action.tool);
        if (executor === null) {
            throw new ActionNotFoundError();
        }
        return executor;
    }

    private async owned(id: string): Promise<AssistantPendingAction> {
        const userId: string | undefined = this.context.get().userId;
        const action: AssistantPendingAction | null = userId === undefined ? null : await this.actions.findOfUser(id, userId);
        if (action === null) {
            throw new ActionNotFoundError();
        }
        return action;
    }
}
