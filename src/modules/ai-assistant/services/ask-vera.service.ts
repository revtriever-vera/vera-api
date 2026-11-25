import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { LlmPort } from '../../../core/llm/llm.port';
import { LlmGenerationRequest, LlmGenerationResponse } from '../../../core/llm/llm.types';
import { PaidUsageMeter } from '../../../core/usage/services/paid-usage-meter.service';
import { CapReachedError } from '../../../core/usage/usage.errors';
import { UsageState } from '../../../core/usage/usage.types';
import { AppLocale } from '../../../shared/i18n/locale';
import { CompanyTimezoneService } from '../../identity/services/company-timezone.service';
import { AiTextRenderer } from '../domain/context/ai-text-renderer';
import { failureText, greetingText, pixRefusalText } from '../domain/ask-fixed-replies';
import { needsInvestmentNotice, withInvestmentNotice } from '../domain/ask-notice';
import { ChannelProfile, channelProfileOf } from '../domain/ask-channel-profiles';
import { redactPersonalData } from '../../../shared/utils/personal-data-redaction';
import { redactTurns } from '../domain/ask-redaction';
import { assetKeysIn } from '../domain/forbidden-terms';
import { HELP_ROUTES } from '../domain/help/help-catalog';
import { AnswerCheck, AnswerFacts, AnswerVerdict, guardAnswer } from '../domain/ask-answer-guard';
import { prefilterOf, PrefilterVerdict } from '../domain/ask-prefilter';
import { AskLoopInput, AskLoopResult, messagesOf, runAskLoop } from '../domain/ask-vera-loop';
import {
    ASK_VERA_MAX_QUESTION_CHARS,
    ASK_VERA_MAX_STEPS,
    AskVeraAnswer,
    AskVeraInput,
    AskVeraOutcome,
    AskVeraTurn
} from '../domain/ask-vera.types';
import { askVeraAppSystemPromptOf } from '../domain/prompts/ask-vera-app.prompt';
import { askVeraSystemPromptOf } from '../domain/prompts/ask-vera.prompt';
import { AskVeraAccessService } from './ask-vera-access.service';
import { AskVeraTelemetryService } from './ask-vera-telemetry.service';
import { AskVeraToolPort } from './ask-vera-tool.port';
import { AskVeraToolRegistry } from './ask-vera-tool.registry';

export type { AskVeraAnswer, AskVeraInput, AskVeraProposal, AskVeraSent, AskVeraTurn } from '../domain/ask-vera.types';
export { INVESTMENT_NOTICE_TOOLS } from '../domain/ask-vera.types';
export { investmentNoticeText, pixRefusalText } from '../domain/ask-fixed-replies';
export { isReminderRequest } from '../domain/ask-prefilter';

function systemPromptOf(input: AskVeraInput, today: string): string {
    return input.channel === 'app'
        ? askVeraAppSystemPromptOf(input.locale, today, input.screen)
        : askVeraSystemPromptOf(input.locale, today);
}

interface Question {
    readonly text: string;
    readonly history: readonly AskVeraTurn[];
}

function knownAssetsOf(question: Question): ReadonlySet<string> {
    const texts: readonly string[] = [...question.history.map((turn: AskVeraTurn): string => turn.text), question.text];
    return new Set<string>(texts.flatMap(assetKeysIn));
}

@Injectable()
export class AskVeraService {
    public constructor(
        private readonly llm: LlmPort,
        private readonly registry: AskVeraToolRegistry,
        private readonly access: AskVeraAccessService,
        private readonly meter: PaidUsageMeter,
        private readonly timezones: CompanyTimezoneService,
        private readonly renderer: AiTextRenderer,
        private readonly context: AppContext,
        private readonly telemetry: AskVeraTelemetryService
    ) {}

    public async ask(input: AskVeraInput): Promise<AskVeraAnswer> {
        const question: Question = {
            text: redactPersonalData(input.text.trim()).slice(0, ASK_VERA_MAX_QUESTION_CHARS),
            history: redactTurns(input.history)
        };
        const verdict: PrefilterVerdict = prefilterOf(question.text);
        if (verdict !== null) {
            return this.prefiltered(verdict, input);
        }
        await this.access.assertAllowed(input);
        return this.context.run({ ...this.context.get(), locale: input.locale }, async (): Promise<AskVeraAnswer> =>
            this.answer(input, question)
        );
    }

    private async prefiltered(verdict: 'refusal' | 'greeting', input: AskVeraInput): Promise<AskVeraAnswer> {
        const outcome: AskVeraOutcome = verdict === 'refusal' ? 'fixed_refusal' : 'fixed_greeting';
        const text: string = verdict === 'refusal' ? pixRefusalText(input.locale) : greetingText(input.locale, input);
        this.telemetry.finished({
            outcome,
            meta: { source: 'fixed', steps: 0, toolsUsed: [], truncated: false, proposals: 0, costMicros: 0 }
        });
        return this.answerOf({ text, notice: false, sent: [], source: 'fixed', toolsUsed: [], proposals: [], truncated: false });
    }

    private async answer(input: AskVeraInput, question: Question): Promise<AskVeraAnswer> {
        const tools: readonly AskVeraToolPort[] = await this.registry.available(input.allowedTools);
        const today: string = await this.timezones.todayInCompany();
        const result: AskLoopResult = await this.loop(input, question, tools, today);
        return this.finish(result, input.locale, question.text);
    }

    private async loop(input: AskVeraInput, question: Question, tools: readonly AskVeraToolPort[], today: string): Promise<AskLoopResult> {
        try {
            return await runAskLoop(this.loopInput(input, question, tools, today));
        } catch (error: unknown) {
            if (error instanceof CapReachedError) {
                this.telemetry.capReached();
            }
            throw error;
        }
    }

    private loopInput(input: AskVeraInput, question: Question, tools: readonly AskVeraToolPort[], today: string): AskLoopInput {
        const profile: ChannelProfile = channelProfileOf(input.channel);
        return {
            system: systemPromptOf(input, today),
            messages: messagesOf(question.history, question.text),
            tools,
            locale: input.locale,
            task: profile.task,
            feature: input.feature,
            knownAssets: knownAssetsOf(question),
            messageId: input.messageId,
            maxSteps: ASK_VERA_MAX_STEPS,
            generate: (request: LlmGenerationRequest): Promise<LlmGenerationResponse> => this.llm.generate(request),
            check: (answer: string, facts: AnswerFacts): AnswerVerdict =>
                guardAnswer({ text: answer, facts, locale: input.locale, renderer: this.renderer, profile, routes: HELP_ROUTES }),
            ...this.hooks()
        };
    }

    private hooks(): Pick<AskLoopInput, 'onToolFailure' | 'onCheckFailure'> {
        return {
            onToolFailure: (name: string): void => {
                this.telemetry.toolFailed(name);
            },
            onCheckFailure: (check: AnswerCheck): void => {
                this.telemetry.checkFailed(check);
            }
        };
    }

    private async finish(result: AskLoopResult, locale: AppLocale, question: string): Promise<AskVeraAnswer> {
        const failed: boolean = result.ending === 'truncated' || result.ending === 'check_failed';
        const truncated: boolean = result.ending === 'truncated';
        const notice: boolean = !failed && needsInvestmentNotice(result, question);
        this.record(result, failed, truncated);
        return this.answerOf({
            text: failed ? failureText(locale) : withInvestmentNotice(result.text, notice, locale),
            notice,
            sent: failed ? [] : result.sent,
            source: failed ? 'fixed' : 'model',
            toolsUsed: result.toolsUsed,
            proposals: result.proposals,
            truncated
        });
    }

    private record(result: AskLoopResult, failed: boolean, truncated: boolean): void {
        this.telemetry.finished({
            outcome: failed ? 'fallback' : 'model',
            meta: {
                source: failed ? 'fixed' : 'model',
                steps: result.steps,
                toolsUsed: result.toolsUsed,
                truncated,
                proposals: result.proposals.length,
                costMicros: result.costMicros
            }
        });
    }

    private async answerOf(parts: Omit<AskVeraAnswer, 'usage'>): Promise<AskVeraAnswer> {
        const usage: UsageState = await this.meter.state();
        return { ...parts, usage: { state: usage.state, usedBps: usage.usedBps, resetsAt: usage.resetsAt } };
    }
}
