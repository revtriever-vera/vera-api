import { LLM_TASK_CATALOG } from '../../src/core/llm/catalog/llm-task.catalog';
import { LlmTaskSpec } from '../../src/core/llm/catalog/llm-task.types';
import { LlmDriverResult } from '../../src/core/llm/drivers/llm-driver';
import { JsonObject, LlmReasoning, LlmStopReason } from '../../src/core/llm/llm.types';
import { toolInputSchemaOf } from '../../src/core/llm/tool-input-schema';
import { serializeContext } from '../../src/modules/ai-assistant/domain/context/context-hash';
import { summarySystemPromptOf } from '../../src/modules/ai-assistant/domain/prompts/summary-prompts';
import { summaryOutputSchema } from '../../src/modules/ai-assistant/domain/summary-output.schemas';
import { SummaryKind } from '../../src/modules/ai-assistant/domain/summary.types';
import { EvalCase, EvalTask } from './case.schemas';
import { Engine } from './engine';

export interface Generation {
    readonly text: string;
    readonly stopReason: LlmStopReason;
    readonly outputTokens: number;
    readonly costUsd: number;
    readonly latencyMs: number;
    readonly fixed: boolean;
}

const RESPONSE_SCHEMA: JsonObject = toolInputSchemaOf(summaryOutputSchema);
const KIND_BY_TASK: Readonly<Record<EvalTask, SummaryKind>> = {
    summary_month: 'month',
    summary_cuts: 'cuts',
    summary_portfolio: 'portfolio'
};

export function specOf(task: string, reasoning: LlmReasoning | undefined): LlmTaskSpec {
    const spec: LlmTaskSpec | undefined = LLM_TASK_CATALOG.find((entry: LlmTaskSpec): boolean => entry.task === task);
    if (spec === undefined) {
        throw new Error(`task "${task}" is not in the LLM task catalog`);
    }
    return reasoning === undefined ? spec : { ...spec, reasoning };
}

export function isFixed(item: EvalCase): boolean {
    return item.task === 'summary_cuts' && item.context.status === 'meta_batida';
}

export function costOf(result: LlmDriverResult): number {
    return result.providerCostUsd ?? 0;
}

async function callModel(engine: Engine, spec: LlmTaskSpec, item: EvalCase): Promise<LlmDriverResult> {
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

export async function generate(engine: Engine, spec: LlmTaskSpec, item: EvalCase): Promise<Generation> {
    if (isFixed(item)) {
        return { text: '', stopReason: 'end', outputTokens: 0, costUsd: 0, latencyMs: 0, fixed: true };
    }
    const result: LlmDriverResult = await callModel(engine, spec, item);
    return {
        text: result.text,
        stopReason: result.stopReason,
        outputTokens: result.usage.outputTokens,
        costUsd: costOf(result),
        latencyMs: result.latencyMs,
        fixed: false
    };
}
