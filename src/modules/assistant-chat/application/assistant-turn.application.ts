import { Injectable } from '@nestjs/common';
import { AppContext, AppContextData } from '../../../core/context/app-context.port';
import { UsingTransaction } from '../../../core/database/using-transaction.decorator';
import { QueuePublisherPort } from '../../../core/queue/queue.types';
import { MESSAGE_TYPES, QUEUES } from '../../../shared/constants/queues.constants';
import { AssistantConversation, AssistantMessage, StartedTurn, TurnMode, MESSAGE_STATUSES } from '../domain/assistant-chat.types';
import { TurnNotFoundError } from '../domain/assistant-chat.errors';
import { AssistantConversationDomain } from '../domain/assistant-conversation.domain';
import { AssistantMessageDomain } from '../domain/assistant-message.domain';
import { accessOf, modeOf, sentAvailableOf, sentOf, splitNotice, toolsOf } from '../domain/turn-view';
import { AssistantAccessService } from '../services/assistant-access.service';
import { AssistantChatLogService } from '../services/assistant-chat-log.service';
import { AssistantChatMetricsService } from '../services/assistant-chat-metrics.service';
import { actionSummaryOf } from '../domain/action-view';
import { AssistantTurnExpiry } from '../services/assistant-turn.expiry';
import { ActionSummaryView, SendTurnBody, SentView, TurnStartedView, TurnView } from '../validation/assistant-chat.schemas';
import { TurnRequestedPayload } from '../validation/assistant-chat-jobs.schemas';

const NO_TOOL: string = 'none';

type TurnActionView = ActionSummaryView | null;

@Injectable()
export class AssistantTurnApplication {
    public constructor(
        private readonly conversations: AssistantConversationDomain,
        private readonly messages: AssistantMessageDomain,
        private readonly access: AssistantAccessService,
        private readonly expiry: AssistantTurnExpiry,
        private readonly publisher: QueuePublisherPort,
        private readonly context: AppContext,
        private readonly logs: AssistantChatLogService,
        private readonly metrics: AssistantChatMetricsService
    ) {}

    public async start(input: SendTurnBody): Promise<TurnStartedView> {
        const mode: TurnMode = await this.access.modeOf();
        await this.access.assertCanAsk(mode);
        const started: StartedTurn = await this.persist(input, mode);
        await this.publish(started, input);
        return { turnId: started.turnId, conversationId: started.conversationId };
    }

    public async get(turnId: string): Promise<TurnView> {
        const turn: AssistantMessage = await this.expiry.settled(await this.ownedTurn(turnId));
        const mode: TurnMode = modeOf(turn);
        const usage: TurnView['usage'] = await this.access.usageOf(mode);
        if (turn.status !== MESSAGE_STATUSES.done) {
            return { status: turn.status as TurnView['status'], usage };
        }
        const split: { text: string; notice: string | null } = splitNotice(turn.text);
        return {
            status: 'done',
            answer: {
                text: split.text,
                source: mode,
                toolsUsed: toolsOf(turn),
                sentAvailable: sentAvailableOf(turn),
                access: accessOf(turn, await this.access.lockOf()),
                notice: split.notice,
                action: await this.actionOf(turn.id)
            },
            usage
        };
    }

    private async actionOf(turnId: string): Promise<TurnActionView> {
        const [action] = await this.messages.actionsOfTurns([turnId]);
        return action === undefined ? null : actionSummaryOf(action, new Date());
    }

    public async sent(turnId: string): Promise<SentView> {
        const turn: AssistantMessage = await this.ownedTurn(turnId);
        return { sent: sentOf(turn).map((item) => ({ tool: item.tool, payload: item.payload })) };
    }

    public async feedback(turnId: string): Promise<void> {
        const turn: AssistantMessage = await this.ownedTurn(turnId);
        const tools: string[] = toolsOf(turn);
        for (const tool of tools.length === 0 ? [NO_TOOL] : tools) {
            this.metrics.unhelpful(tool);
        }
    }

    private async ownedTurn(turnId: string): Promise<AssistantMessage> {
        const turn: AssistantMessage | null = await this.messages.findTurn(turnId);
        if (turn === null) {
            throw new TurnNotFoundError();
        }
        const owned: AssistantConversation | null = await this.conversations.findOfUser(turn.conversationId, this.userId());
        if (owned === null) {
            throw new TurnNotFoundError();
        }
        return turn;
    }

    @UsingTransaction()
    private async persist(input: SendTurnBody, mode: TurnMode): Promise<StartedTurn> {
        const now: Date = new Date();
        const existing: AssistantConversation | null = await this.conversationFor(input.conversationId);
        const conversation: AssistantConversation = existing ?? (await this.conversations.open(this.userId(), now));
        const ids: { questionId: string; turnId: string } = await this.messages.startTurn(conversation.id, input.text, mode, now);
        await this.conversations.touch(conversation.id, new Date(now.getTime() + 1));
        return { conversationId: conversation.id, ...ids, newConversation: existing === null };
    }

    private async conversationFor(conversationId: string | undefined): Promise<AssistantConversation | null> {
        if (conversationId === undefined) {
            return this.conversations.latestOfUser(this.userId());
        }
        const owned: AssistantConversation | null = await this.conversations.findOfUser(conversationId, this.userId());
        if (owned === null) {
            throw new TurnNotFoundError();
        }
        return owned;
    }

    private async publish(started: StartedTurn, input: SendTurnBody): Promise<void> {
        const context: AppContextData = this.context.get();
        const payload: TurnRequestedPayload = {
            turnId: started.turnId,
            questionId: started.questionId,
            userId: this.userId(),
            locale: context.locale,
            ...(input.screen === undefined ? {} : { screenPath: input.screen.path })
        };
        try {
            await this.publisher.publish(QUEUES.assistantChat, MESSAGE_TYPES.assistantTurnRequested, payload, {
                jobId: `assistant-turn-${started.turnId}`,
                attempts: 1
            });
        } catch (error: unknown) {
            this.logs.publishFailed(started.turnId, error);
            await this.discard(started);
            throw error;
        }
    }

    private async discard(started: StartedTurn): Promise<void> {
        await this.messages.discard([started.questionId, started.turnId]);
        if (started.newConversation) {
            await this.conversations.erase(started.conversationId);
        }
    }

    private userId(): string {
        const userId: string | undefined = this.context.get().userId;
        if (userId === undefined) {
            throw new TurnNotFoundError();
        }
        return userId;
    }
}
