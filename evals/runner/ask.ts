import { LlmTaskSpec } from '../../src/core/llm/catalog/llm-task.types';
import { LlmDriverResult } from '../../src/core/llm/drivers/llm-driver';
import { LlmGenerationRequest, LlmGenerationResponse } from '../../src/core/llm/llm.types';
import { AiTextRenderer } from '../../src/modules/ai-assistant/domain/context/ai-text-renderer';
import { guardAnswer } from '../../src/modules/ai-assistant/domain/ask-answer-guard';
import { pixRefusalText, greetingText } from '../../src/modules/ai-assistant/domain/ask-fixed-replies';
import { prefilterOf } from '../../src/modules/ai-assistant/domain/ask-prefilter';
import { AnswerFacts, AnswerVerdict } from '../../src/modules/ai-assistant/domain/ask-answer-guard';
import { MockLlmDriver } from '../../src/core/llm/drivers/mock-llm.driver';
import { AskLoopInput, AskLoopResult, messagesOf, runAskLoop } from '../../src/modules/ai-assistant/domain/ask-vera-loop';
import { askVeraAppSystemPromptOf } from '../../src/modules/ai-assistant/domain/prompts/ask-vera-app.prompt';
import { redactPersonalData, redactTurns } from '../../src/modules/ai-assistant/domain/ask-redaction';
import { CHANNEL_PROFILES, ChannelProfile } from '../../src/modules/ai-assistant/domain/ask-channel-profiles';
import { HELP_ROUTES } from '../../src/modules/ai-assistant/domain/help/help-catalog';
import { assetKeysIn } from '../../src/modules/ai-assistant/domain/forbidden-terms';
import { needsInvestmentNotice, withInvestmentNotice } from '../../src/modules/ai-assistant/domain/ask-notice';
import { ASK_VERA_MAX_STEPS } from '../../src/modules/ai-assistant/domain/ask-vera.types';
import { askVeraSystemPromptOf } from '../../src/modules/ai-assistant/domain/prompts/ask-vera.prompt';
import { ASK_TODAY, appToolsOf, fixtureToolsOf } from './ask-fixtures';
import { AskCase } from './case.schemas';
import type { AskVeraTurn } from '../../src/modules/ai-assistant/domain/ask-vera.types';
import { Engine } from './engine';
import { CallTrace, fixedGeneration, Generation, costOf, traceOf } from './generate';

function isApp(item: AskCase): boolean {
    return item.task === 'ask_vera_app_step';
}

interface Question {
    readonly text: string;
    readonly history: readonly AskVeraTurn[];
}

function questionOf(item: AskCase): Question {
    return isApp(item)
        ? { text: redactPersonalData(item.question), history: redactTurns(item.history) }
        : { text: item.question, history: item.history };
}

export function askFixedText(item: AskCase): string | null {
    const verdict: ReturnType<typeof prefilterOf> = prefilterOf(questionOf(item).text);
    if (verdict === null) {
        return null;
    }
    return verdict === 'refusal'
        ? pixRefusalText(item.locale)
        : greetingText(item.locale, isApp(item) ? { channel: 'app', feature: 'help' } : { channel: 'whatsapp', feature: 'whatsapp' });
}

interface Meter {
    costUsd: number;
    outputTokens: number;
    latencyMs: number;
    steps: number;
    calls: CallTrace[];
    sent: string[];
}

function enqueueMock(engine: Engine, item: AskCase): void {
    const mock: MockLlmDriver | null = engine.mock();
    if (mock === null) {
        return;
    }
    if (item.mockTools.length > 0) {
        mock.enqueue({
            text: '',
            toolUses: item.mockTools.map((tool, index) => ({
                toolUseId: `t${String(index)}`,
                name: tool.name,
                input: JSON.parse(JSON.stringify(tool.input)) as never
            }))
        });
    }
    mock.enqueue(item.reference.join(' '));
}

function userTextsOf(request: LlmGenerationRequest): string[] {
    return request.messages
        .filter((message): boolean => message.role === 'user')
        .flatMap((message): string[] =>
            typeof message.content === 'string'
                ? [message.content]
                : message.content.flatMap((block): string[] => (block.kind === 'text' ? [block.text] : []))
        );
}

function generator(engine: Engine, spec: LlmTaskSpec, meter: Meter): (request: LlmGenerationRequest) => Promise<LlmGenerationResponse> {
    return async (request: LlmGenerationRequest): Promise<LlmGenerationResponse> => {
        engine.assertBudget();
        meter.sent.push(...userTextsOf(request));
        const result: LlmDriverResult = await engine.driver.generate({ credentials: engine.credentials, spec, request });
        engine.spentUsd += costOf(result);
        meter.costUsd += costOf(result);
        meter.outputTokens += result.usage.outputTokens;
        meter.latencyMs += result.latencyMs;
        meter.steps += 1;
        meter.calls.push(traceOf(result));
        return {
            text: result.text,
            toolUses: result.toolUses,
            stopReason: result.stopReason,
            usage: result.usage,
            costMicros: 0,
            callId: String(meter.steps)
        };
    };
}

function systemOf(item: AskCase): string {
    if (!isApp(item)) {
        return askVeraSystemPromptOf(item.locale, ASK_TODAY);
    }
    return askVeraAppSystemPromptOf(item.locale, ASK_TODAY, item.screen === undefined ? undefined : { path: item.screen });
}

function loopInputOf(engine: Engine, spec: LlmTaskSpec, item: AskCase, meter: Meter): AskLoopInput {
    const renderer: AiTextRenderer = new AiTextRenderer();
    const app: boolean = isApp(item);
    const question: Question = questionOf(item);
    const profile: ChannelProfile = app ? CHANNEL_PROFILES.app : CHANNEL_PROFILES.whatsapp;
    return {
        system: systemOf(item),
        messages: messagesOf(question.history, question.text),
        tools: app ? appToolsOf(item) : fixtureToolsOf(item.locale),
        locale: item.locale,
        task: profile.task,
        feature: app ? 'help' : 'whatsapp',
        knownAssets: new Set<string>([...question.history.map((turn) => turn.text), question.text].flatMap(assetKeysIn)),
        messageId: item.id,
        maxSteps: ASK_VERA_MAX_STEPS,
        generate: generator(engine, spec, meter),
        check: (text: string, facts: AnswerFacts): AnswerVerdict =>
            guardAnswer({ text, facts, locale: item.locale, renderer, profile, routes: HELP_ROUTES }),
        onToolFailure: (): void => undefined,
        onCheckFailure: (): void => undefined
    };
}

function generationOf(result: AskLoopResult, meter: Meter, item: AskCase): Generation {
    return {
        text: withInvestmentNotice(result.text, needsInvestmentNotice(result, item.question), item.locale),
        stopReason: 'end',
        outputTokens: meter.outputTokens,
        costUsd: meter.costUsd,
        latencyMs: meter.latencyMs,
        fixed: false,
        toolsUsed: result.toolsUsed,
        ending: result.ending,
        calls: meter.calls,
        sent: meter.sent
    };
}

export async function askGenerate(engine: Engine, spec: LlmTaskSpec, item: AskCase): Promise<Generation> {
    const fixed: string | null = askFixedText(item);
    if (fixed !== null) {
        return fixedGeneration(fixed);
    }
    enqueueMock(engine, item);
    const meter: Meter = { costUsd: 0, outputTokens: 0, latencyMs: 0, steps: 0, calls: [], sent: [] };
    return generationOf(await runAskLoop(loopInputOf(engine, spec, item, meter)), meter, item);
}
