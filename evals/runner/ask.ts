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
import { CHANNEL_PROFILES } from '../../src/modules/ai-assistant/domain/ask-channel-profiles';
import { HELP_ROUTES } from '../../src/modules/ai-assistant/domain/help/help-catalog';
import { assetKeysIn } from '../../src/modules/ai-assistant/domain/forbidden-terms';
import { needsInvestmentNotice, withInvestmentNotice } from '../../src/modules/ai-assistant/domain/ask-notice';
import { ASK_VERA_MAX_STEPS } from '../../src/modules/ai-assistant/domain/ask-vera.types';
import { askVeraSystemPromptOf } from '../../src/modules/ai-assistant/domain/prompts/ask-vera.prompt';
import { ASK_TODAY, fixtureToolsOf } from './ask-fixtures';
import { AskCase } from './case.schemas';
import { Engine } from './engine';
import { CallTrace, fixedGeneration, Generation, costOf, traceOf } from './generate';

export function askFixedText(item: AskCase): string | null {
    const verdict: ReturnType<typeof prefilterOf> = prefilterOf(item.question);
    if (verdict === null) {
        return null;
    }
    return verdict === 'refusal' ? pixRefusalText(item.locale) : greetingText(item.locale);
}

interface Meter {
    costUsd: number;
    outputTokens: number;
    latencyMs: number;
    steps: number;
    calls: CallTrace[];
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

function generator(engine: Engine, spec: LlmTaskSpec, meter: Meter): (request: LlmGenerationRequest) => Promise<LlmGenerationResponse> {
    return async (request: LlmGenerationRequest): Promise<LlmGenerationResponse> => {
        engine.assertBudget();
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

function loopInputOf(engine: Engine, spec: LlmTaskSpec, item: AskCase, meter: Meter): AskLoopInput {
    const renderer: AiTextRenderer = new AiTextRenderer();
    return {
        system: askVeraSystemPromptOf(item.locale, ASK_TODAY),
        messages: messagesOf(item.history, item.question),
        tools: fixtureToolsOf(item.locale),
        locale: item.locale,
        task: 'ask_vera_step',
        feature: 'whatsapp',
        knownAssets: new Set<string>([...item.history.map((turn) => turn.text), item.question].flatMap(assetKeysIn)),
        messageId: item.id,
        maxSteps: ASK_VERA_MAX_STEPS,
        generate: generator(engine, spec, meter),
        check: (text: string, facts: AnswerFacts): AnswerVerdict =>
            guardAnswer({ text, facts, locale: item.locale, renderer, profile: CHANNEL_PROFILES.whatsapp, routes: HELP_ROUTES }),
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
        calls: meter.calls
    };
}

export async function askGenerate(engine: Engine, spec: LlmTaskSpec, item: AskCase): Promise<Generation> {
    const fixed: string | null = askFixedText(item);
    if (fixed !== null) {
        return fixedGeneration(fixed);
    }
    enqueueMock(engine, item);
    const meter: Meter = { costUsd: 0, outputTokens: 0, latencyMs: 0, steps: 0, calls: [] };
    return generationOf(await runAskLoop(loopInputOf(engine, spec, item, meter)), meter, item);
}
