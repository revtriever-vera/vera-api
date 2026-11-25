import { LLM_TASKS } from '../llm.types';
import { LlmTaskSpec } from './llm-task.types';

export const LLM_TASK_CATALOG: readonly LlmTaskSpec[] = [
    {
        task: LLM_TASKS.summaryMonth,
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
        maxOutputTokens: 8192,
        maxCostMicros: 59_000,
        temperature: 0.3,
        reasoning: 'minimal',
        timeoutMs: 45_000,
        maxRetries: 2,
        evalThreshold: 0.8,
        promptVersion: 'v4'
    },
    {
        task: LLM_TASKS.askVeraAppStep,
        maxOutputTokens: 8192,
        maxCostMicros: 59_000,
        temperature: 0.3,
        reasoning: 'minimal',
        timeoutMs: 45_000,
        maxRetries: 2,
        evalThreshold: 0.8,
        promptVersion: 'v1'
    }
];
