import { LLM_TASK_CATALOG } from '../../src/core/llm/catalog/llm-task.catalog';
import { LlmTaskSpec } from '../../src/core/llm/catalog/llm-task.types';
import { LlmDriverResult } from '../../src/core/llm/drivers/llm-driver';
import { JsonObject, LlmReasoning, LlmStopReason } from '../../src/core/llm/llm.types';
import { toolInputSchemaOf } from '../../src/core/llm/tool-input-schema';
import { serializeContext } from '../../src/modules/ai-assistant/domain/context/context-hash';
import { summarySystemPromptOf } from '../../src/modules/ai-assistant/domain/prompts/summary-prompts';
import { summaryOutputSchema } from '../../src/modules/ai-assistant/domain/summary-output.schemas';
import { GeneratedSummaryKind } from '../../src/modules/ai-assistant/domain/summary.types';
import { prefilterOf } from '../../src/modules/ai-assistant/domain/ask-prefilter';
import { marketDocumentSummaryPromptOf } from '../../src/modules/market-documents/domain/market-document-summary.prompt';
import { SUMMARY_RESPONSE_SCHEMA, summaryPayloadOf } from '../../src/modules/market-documents/domain/market-document-summary.request';
import { DocumentCase, EvalCase, isAskCase, isDocumentCase, SummaryCase } from './case.schemas';
import { Engine } from './engine';

export interface CallTrace {
    readonly finishReason: string;
    readonly stopReason: LlmStopReason;
    readonly outputTokens: number;
    readonly reasoningTokens: number;
    readonly reasoningChars: number;
    readonly textChars: number;
    readonly toolCalls: number;
}

export interface Generation {
    readonly text: string;
    readonly stopReason: LlmStopReason;
    readonly outputTokens: number;
    readonly costUsd: number;
    readonly latencyMs: number;
    readonly fixed: boolean;
    readonly toolsUsed: readonly string[];
    readonly ending: 'answered' | 'direct' | 'truncated' | 'check_failed';
    readonly calls: readonly CallTrace[];
    readonly sent?: readonly string[];
}

const RESPONSE_SCHEMA: JsonObject = toolInputSchemaOf(summaryOutputSchema);
const KIND_BY_TASK: Readonly<Record<SummaryCase['task'], GeneratedSummaryKind>> = {
    summary_month: 'month',
    summary_cuts: 'cuts',
    summary_portfolio: 'portfolio',
    summary_monthly_review: 'monthly_review'
};

export function specOf(task: string, reasoning: LlmReasoning | undefined): LlmTaskSpec {
    const spec: LlmTaskSpec | undefined = LLM_TASK_CATALOG.find((entry: LlmTaskSpec): boolean => entry.task === task);
    if (spec === undefined) {
        throw new Error(`task "${task}" is not in the LLM task catalog`);
    }
    return reasoning === undefined ? spec : { ...spec, reasoning };
}

export function isFixed(item: EvalCase): boolean {
    if (isAskCase(item)) {
        return prefilterOf(item.question) !== null;
    }
    return item.task === 'summary_cuts' && item.context.status === 'meta_batida';
}

export function traceOf(result: LlmDriverResult): CallTrace {
    return {
        finishReason: result.diagnostic?.finishReason ?? result.stopReason,
        stopReason: result.stopReason,
        outputTokens: result.usage.outputTokens,
        reasoningTokens: result.diagnostic?.reasoningTokens ?? 0,
        reasoningChars: result.diagnostic?.reasoningChars ?? 0,
        textChars: result.text.length,
        toolCalls: result.toolUses.length
    };
}

export function costOf(result: LlmDriverResult): number {
    return result.providerCostUsd ?? 0;
}

async function callModel(engine: Engine, spec: LlmTaskSpec, item: SummaryCase): Promise<LlmDriverResult> {
    engine.assertBudget();
    engine.mock()?.enqueue(JSON.stringify({ paragraphs: item.reference }));
    const result: LlmDriverResult = await engine.driver.generate({
        credentials: engine.credentials,
        spec,
        request: {
            task: item.task,
            system: summarySystemPromptOf(KIND_BY_TASK[item.task], item.locale),
            messages: [{ role: 'user', content: serializeContext(item.context) }],
            responseSchema: RESPONSE_SCHEMA
        }
    });
    engine.spentUsd += costOf(result);
    return result;
}

export function fixedGeneration(text: string): Generation {
    return {
        text,
        stopReason: 'end',
        outputTokens: 0,
        costUsd: 0,
        latencyMs: 0,
        fixed: true,
        toolsUsed: [],
        ending: 'answered',
        calls: []
    };
}

function documentMessage(item: DocumentCase): string {
    return summaryPayloadOf(
        {
            issuerName: item.document.issuer,
            tickers: item.document.tickers,
            category: item.document.category,
            publishedAt: item.document.publishedAt,
            text: item.document.text
        },
        item.locale
    );
}

async function callDocumentModel(engine: Engine, spec: LlmTaskSpec, item: DocumentCase): Promise<LlmDriverResult> {
    engine.assertBudget();
    engine.mock()?.enqueue(JSON.stringify({ summary: item.reference.join(' '), ...item.referenceOutput }));
    const result: LlmDriverResult = await engine.driver.generate({
        credentials: engine.credentials,
        spec,
        request: {
            task: item.task,
            system: marketDocumentSummaryPromptOf(item.locale),
            messages: [{ role: 'user', content: documentMessage(item) }],
            responseSchema: SUMMARY_RESPONSE_SCHEMA
        }
    });
    engine.spentUsd += costOf(result);
    return result;
}

export async function generate(engine: Engine, spec: LlmTaskSpec, item: SummaryCase | DocumentCase): Promise<Generation> {
    if (isDocumentCase(item)) {
        return generationOf(await callDocumentModel(engine, spec, item));
    }
    if (isFixed(item)) {
        return fixedGeneration('');
    }
    return generationOf(await callModel(engine, spec, item));
}

function generationOf(result: LlmDriverResult): Generation {
    return {
        text: result.text,
        stopReason: result.stopReason,
        outputTokens: result.usage.outputTokens,
        costUsd: costOf(result),
        latencyMs: result.latencyMs,
        fixed: false,
        toolsUsed: [],
        ending: 'answered',
        calls: [traceOf(result)]
    };
}
