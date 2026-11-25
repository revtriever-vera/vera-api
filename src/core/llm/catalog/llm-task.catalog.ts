import { LLM_TASKS } from '../llm.types';
import { INVESTMENT_EXTRACT_SCHEMA } from './investment-extract.schema';
import { LlmTaskSpec } from './llm-task.types';

export const LLM_TASK_CATALOG: readonly LlmTaskSpec[] = [
    {
        task: LLM_TASKS.summaryMonth,
        model: 'primary',
        maxOutputTokens: 6144,
        maxCostMicros: 27_000,
        temperature: 0.2,
        reasoning: 'minimal',
        timeoutMs: 30_000,
        maxRetries: 2,
        evalThreshold: 0.8,
        promptVersion: 'v3'
    },
    {
        task: LLM_TASKS.summaryCuts,
        model: 'primary',
        maxOutputTokens: 6144,
        maxCostMicros: 27_000,
        temperature: 0.2,
        reasoning: 'minimal',
        timeoutMs: 30_000,
        maxRetries: 2,
        evalThreshold: 0.8,
        promptVersion: 'v4'
    },
    {
        task: LLM_TASKS.summaryPortfolio,
        model: 'primary',
        maxOutputTokens: 6144,
        maxCostMicros: 27_000,
        temperature: 0.2,
        reasoning: 'minimal',
        timeoutMs: 30_000,
        maxRetries: 2,
        evalThreshold: 0.8,
        promptVersion: 'v2'
    },
    {
        task: LLM_TASKS.askVeraStep,
        model: 'primary',
        maxOutputTokens: 8192,
        maxCostMicros: 59_000,
        temperature: 0.3,
        reasoning: 'minimal',
        timeoutMs: 45_000,
        maxRetries: 2,
        evalThreshold: 0.8,
        promptVersion: 'v5'
    },
    {
        task: LLM_TASKS.askVeraAppStep,
        model: 'primary',
        maxOutputTokens: 8192,
        maxCostMicros: 59_000,
        temperature: 0.3,
        reasoning: 'minimal',
        timeoutMs: 45_000,
        maxRetries: 2,
        evalThreshold: 0.8,
        promptVersion: 'v3'
    },
    {
        task: LLM_TASKS.investmentExtract,
        model: 'vision',
        responseSchema: INVESTMENT_EXTRACT_SCHEMA,
        maxOutputTokens: 8192,
        maxCostMicros: 60_000,
        temperature: 0,
        reasoning: 'minimal',
        timeoutMs: 90_000,
        maxRetries: 1,
        evalThreshold: 0.8,
        promptVersion: 'v3',
        outsideCap: true
    }
];
