import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { UsingTransaction } from '../../../core/database/using-transaction.decorator';
import { CapReachedError } from '../../../core/usage/usage.errors';
import { AppLocale } from '../../../shared/i18n/locale';
import { AppError } from '../../../shared/errors/app.error';
import { MemberDirectoryService } from '../../identity/services/member-directory.service';
import { AskVeraAnswer, AskVeraInput, AskVeraProposal, AskVeraService, AskVeraTurn } from '../../ai-assistant/services/ask-vera.service';
import { INVESTMENT_IMPORT_TOOL } from '../../investment-import/services/investment-import-assistant.service';
import { withoutFileLine } from '../domain/attachment-line';
import { ImportProposalTool } from '../services/import-proposal.tool';
import { AssistantMessage, MESSAGE_STATUSES, TURN_MODES, TurnMode } from '../domain/assistant-chat.types';
import { AssistantMessageDomain } from '../domain/assistant-message.domain';
import { appToolsOf } from '../domain/channel-tools';
import { AssistantActionService } from '../services/assistant-action.service';
import { AssistantAccessService } from '../services/assistant-access.service';
import { AssistantChatLogService } from '../services/assistant-chat-log.service';
import { AssistantChatMetricsService, TURN_OUTCOMES, TurnOutcome } from '../services/assistant-chat-metrics.service';
import { TurnRequestedPayload } from '../validation/assistant-chat-jobs.schemas';

const HISTORY_MESSAGES: number = 6;
const NO_TOOLS: ReadonlySet<string> = new Set();

const IMPORT_QUESTIONS: Readonly<Record<AppLocale, string>> = {
    'pt-BR': 'Importa o arquivo que anexei.',
    en: 'Import the file I attached.'
};

function importQuestionOf(stored: string, locale: AppLocale): string {
    const typed: string = withoutFileLine(stored);
    return typed === '' ? IMPORT_QUESTIONS[locale] : typed;
}

const MS_PER_SECOND: number = 1000;

function importInputOf(base: AskVeraInput, proposal: NonNullable<TurnRequestedPayload['importProposal']>): AskVeraInput {
    return {
        ...base,
        text: importQuestionOf(base.text, base.locale),
        allowedTools: NO_TOOLS,
        importAttached: true,
        extraTools: [new ImportProposalTool(proposal.summary, proposal.payload)]
    };
}

function historyOf(messages: readonly AssistantMessage[]): AskVeraTurn[] {
    return messages
        .map((message: AssistantMessage): AskVeraTurn => ({
            role: message.role as AskVeraTurn['role'],
            text: withoutFileLine(message.text)
        }))
        .filter((turn: AskVeraTurn): boolean => turn.text !== '');
}

function proposalOf(mode: TurnMode, answer: AskVeraAnswer, request: TurnRequestedPayload): AskVeraProposal | undefined {
    if (request.importProposal === undefined) {
        return mode === TURN_MODES.ai ? answer.proposals[0] : undefined;
    }
    return (
        answer.proposals.find((proposal: AskVeraProposal): boolean => proposal.tool === INVESTMENT_IMPORT_TOOL) ?? {
            tool: INVESTMENT_IMPORT_TOOL,
            summary: request.importProposal.summary,
            payload: request.importProposal.payload
        }
    );
}

@Injectable()
export class AssistantAnswerApplication {
    public constructor(
        private readonly messages: AssistantMessageDomain,
        private readonly access: AssistantAccessService,
        private readonly ask: AskVeraService,
        private readonly actions: AssistantActionService,
        private readonly members: MemberDirectoryService,
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
            await this.finish(turn, mode, await this.generate(request, question, mode), request, startedAt);
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
        const base: AskVeraInput = {
            channel: 'app',
            feature: mode,
            text: question.text,
            history: historyOf(history),
            locale: request.locale,
            messageId: request.turnId,
            allowedTools: appToolsOf(mode, await this.members.canEdit(request.userId)),
            ...(request.screenPath === undefined ? {} : { screen: { path: request.screenPath } })
        };
        return this.ask.ask(request.importProposal === undefined ? base : importInputOf(base, request.importProposal));
    }

    private async finish(
        turn: AssistantMessage,
        mode: TurnMode,
        answer: AskVeraAnswer,
        request: TurnRequestedPayload,
        startedAt: number
    ): Promise<void> {
        const proposal: AskVeraProposal | undefined = proposalOf(mode, answer, request);
        const stored: boolean = await this.settle(turn, mode, answer, proposal);
        if (stored) {
            this.report(turn.id, mode, answer.source === 'model' ? TURN_OUTCOMES.answered : TURN_OUTCOMES.fixed, startedAt);
        }
    }

    @UsingTransaction()
    private async settle(
        turn: AssistantMessage,
        mode: TurnMode,
        answer: AskVeraAnswer,
        proposal: AskVeraProposal | undefined
    ): Promise<boolean> {
        const stored: boolean = await this.messages.finish(turn.id, {
            text: proposal?.summary ?? answer.text,
            mode,
            toolsUsed: answer.toolsUsed,
            sent: mode === TURN_MODES.ai ? answer.sent : null
        });
        if (stored && proposal !== undefined) {
            await this.actions.propose(turn, proposal);
        }
        return stored;
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
