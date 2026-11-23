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
import { cvmNoticeText, failureText, greetingText, pixRefusalText } from '../domain/ask-fixed-replies';
import { AnswerCheck, AnswerFacts, AnswerVerdict, guardAnswer } from '../domain/ask-answer-guard';
import { prefilterOf, PrefilterVerdict } from '../domain/ask-prefilter';
import { AskLoopInput, AskLoopResult, messagesOf, runAskLoop } from '../domain/ask-vera-loop';
import {
    ASK_VERA_MAX_QUESTION_CHARS,
    ASK_VERA_MAX_STEPS,
    AskVeraAnswer,
    AskVeraInput,
    AskVeraOutcome,
    CVM_NOTICE_TOOLS
} from '../domain/ask-vera.types';
import { askVeraSystemPromptOf } from '../domain/prompts/ask-vera.prompt';
import { AskVeraAccessService } from './ask-vera-access.service';
import { AskVeraTelemetryService } from './ask-vera-telemetry.service';
import { AskVeraToolPort } from './ask-vera-tool.port';
import { AskVeraToolRegistry } from './ask-vera-tool.registry';

export type { AskVeraAnswer, AskVeraInput, AskVeraProposal, AskVeraTurn } from '../domain/ask-vera.types';
export { CVM_NOTICE_TOOLS } from '../domain/ask-vera.types';
export { cvmNoticeText, pixRefusalText } from '../domain/ask-fixed-replies';

function isCvmNoticeTool(tool: string): boolean {
    return CVM_NOTICE_TOOLS.has(tool);
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
        const text: string = input.text.trim().slice(0, ASK_VERA_MAX_QUESTION_CHARS);
        const verdict: PrefilterVerdict = prefilterOf(text);
        if (verdict !== null) {
            return this.prefiltered(verdict, input.locale);
        }
        await this.access.assertAllowed();
        return this.context.run({ ...this.context.get(), locale: input.locale }, async (): Promise<AskVeraAnswer> =>
            this.answer(input, text)
        );
    }

    private async prefiltered(verdict: 'refusal' | 'greeting', locale: AppLocale): Promise<AskVeraAnswer> {
        const outcome: AskVeraOutcome = verdict === 'refusal' ? 'fixed_refusal' : 'fixed_greeting';
        const text: string = verdict === 'refusal' ? pixRefusalText(locale) : greetingText(locale);
        this.telemetry.finished({
            outcome,
            meta: { source: 'fixed', steps: 0, toolsUsed: [], truncated: false, proposals: 0, costMicros: 0 }
        });
        return this.answerOf({ text, source: 'fixed', toolsUsed: [], proposals: [], truncated: false });
    }

    private async answer(input: AskVeraInput, text: string): Promise<AskVeraAnswer> {
        const tools: readonly AskVeraToolPort[] = await this.registry.available(input.allowedTools);
        const today: string = await this.timezones.todayInCompany();
        const result: AskLoopResult = await this.loop(input, text, tools, today);
        return this.finish(result, input.locale);
    }

    private async loop(input: AskVeraInput, text: string, tools: readonly AskVeraToolPort[], today: string): Promise<AskLoopResult> {
        try {
            return await runAskLoop(this.loopInput(input, text, tools, today));
        } catch (error: unknown) {
            if (error instanceof CapReachedError) {
                this.telemetry.capReached();
            }
            throw error;
        }
    }

    private loopInput(input: AskVeraInput, text: string, tools: readonly AskVeraToolPort[], today: string): AskLoopInput {
        return {
            system: askVeraSystemPromptOf(input.locale, today),
            messages: messagesOf(input.history, text),
            tools,
            locale: input.locale,
            messageId: input.messageId,
            maxSteps: ASK_VERA_MAX_STEPS,
            generate: (request: LlmGenerationRequest): Promise<LlmGenerationResponse> => this.llm.generate(request),
            check: (answer: string, facts: AnswerFacts): AnswerVerdict =>
                guardAnswer({ text: answer, facts, locale: input.locale, renderer: this.renderer }),
            onToolFailure: (name: string): void => {
                this.telemetry.toolFailed(name);
            },
            onCheckFailure: (check: AnswerCheck): void => {
                this.telemetry.checkFailed(check);
            }
        };
    }

    private async finish(result: AskLoopResult, locale: AppLocale): Promise<AskVeraAnswer> {
        const failed: boolean = result.ending === 'truncated' || result.ending === 'check_failed';
        const truncated: boolean = result.ending === 'truncated';
        const text: string = failed ? failureText(locale) : this.withNotice(result, locale);
        this.record(result, failed, truncated);
        return this.answerOf({
            text,
            source: failed ? 'fixed' : 'model',
            toolsUsed: result.toolsUsed,
            proposals: result.proposals,
            truncated
        });
    }

    private withNotice(result: AskLoopResult, locale: AppLocale): string {
        const cited: boolean = result.toolsUsed.some(isCvmNoticeTool);
        return cited && result.ending === 'answered' ? `${result.text}\n${cvmNoticeText(locale)}` : result.text;
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
