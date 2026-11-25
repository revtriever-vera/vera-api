import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { CapReachedError } from '../../../core/usage/usage.errors';
import { AppError } from '../../../shared/errors/app.error';
import { AskVeraAnswer, AskVeraService, AskVeraTurn } from '../../ai-assistant/services/ask-vera.service';
import { AssistantMessage, MESSAGE_STATUSES, TURN_MODES, TurnMode } from '../domain/assistant-chat.types';
import { AssistantMessageDomain } from '../domain/assistant-message.domain';
import { APP_CHANNEL_TOOLS } from '../domain/channel-tools';
import { AssistantAccessService } from '../services/assistant-access.service';
import { AssistantChatLogService } from '../services/assistant-chat-log.service';
import { AssistantChatMetricsService, TURN_OUTCOMES, TurnOutcome } from '../services/assistant-chat-metrics.service';
import { TurnRequestedPayload } from '../validation/assistant-chat-jobs.schemas';

const HISTORY_MESSAGES: number = 6;
const MS_PER_SECOND: number = 1000;

@Injectable()
export class AssistantAnswerApplication {
    public constructor(
        private readonly messages: AssistantMessageDomain,
        private readonly access: AssistantAccessService,
        private readonly ask: AskVeraService,
        private readonly context: AppContext,
        private readonly logs: AssistantChatLogService,
        private readonly metrics: AssistantChatMetricsService
    ) {}

    public async run(request: TurnRequestedPayload): Promise<void> {
        await this.context.run({ ...this.context.get(), userId: request.userId, locale: request.locale }, async (): Promise<void> =>
            this.answer(request)
        );
    }

    private async answer(request: TurnRequestedPayload): Promise<void> {
        const turn: AssistantMessage | null = await this.messages.findTurn(request.turnId);
        if (turn?.status !== MESSAGE_STATUSES.pending) {
            return;
        }
        const question: AssistantMessage | null = await this.messages.findQuestion(request.questionId);
        const mode: TurnMode = await this.access.modeOf();
        const startedAt: number = Date.now();
        try {
            if (question === null) {
                throw new Error('assistant question missing');
            }
            await this.finish(turn, mode, await this.generate(request, question, mode), startedAt);
        } catch (error: unknown) {
            await this.failed(turn, mode, error, startedAt);
        }
    }

    private async generate(request: TurnRequestedPayload, question: AssistantMessage, mode: TurnMode): Promise<AskVeraAnswer> {
        const history: AssistantMessage[] = await this.messages.answeredBefore(
            question.conversationId,
            question.createdAt,
            HISTORY_MESSAGES
        );
        return this.ask.ask({
            channel: 'app',
            feature: mode,
            text: question.text,
            history: history.map((message: AssistantMessage): AskVeraTurn => ({
                role: message.role as AskVeraTurn['role'],
                text: message.text
            })),
            locale: request.locale,
            messageId: request.turnId,
            allowedTools: APP_CHANNEL_TOOLS,
            ...(request.screenPath === undefined ? {} : { screen: { path: request.screenPath } })
        });
    }

    private async finish(turn: AssistantMessage, mode: TurnMode, answer: AskVeraAnswer, startedAt: number): Promise<void> {
        const stored: boolean = await this.messages.finish(turn.id, {
            text: answer.text,
            mode,
            toolsUsed: answer.toolsUsed,
            sent: mode === TURN_MODES.ai ? answer.sent : null
        });
        if (stored) {
            this.report(turn.id, mode, answer.source === 'model' ? TURN_OUTCOMES.answered : TURN_OUTCOMES.fixed, startedAt);
        }
    }

    private async failed(turn: AssistantMessage, mode: TurnMode, error: unknown, startedAt: number): Promise<void> {
        const code: string = error instanceof AppError ? error.code : 'unexpected';
        this.logs.turnFailed(turn.id, mode, code);
        if (await this.messages.fail(turn.id, mode)) {
            this.report(turn.id, mode, error instanceof CapReachedError ? TURN_OUTCOMES.capReached : TURN_OUTCOMES.failed, startedAt);
        }
    }

    private report(turnId: string, mode: TurnMode, outcome: TurnOutcome, startedAt: number): void {
        const elapsed: number = Date.now() - startedAt;
        this.metrics.turn(mode, outcome);
        this.metrics.seconds(elapsed / MS_PER_SECOND);
        this.logs.turnFinished(turnId, mode, outcome, elapsed);
    }
}
