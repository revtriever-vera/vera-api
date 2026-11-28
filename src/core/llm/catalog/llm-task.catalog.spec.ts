import { describe, expect, it } from 'vitest';
import { LLM_TASKS } from '../llm.types';
import { LLM_TASK_CATALOG } from './llm-task.catalog';
import { LlmTaskSpec } from './llm-task.types';

const DEV_PRICE_USD_PER_MILLION: { readonly input: number; readonly output: number } = { input: 0.1, output: 0.2 };
const DEV_USD_BRL: number = 5;
const MAX_INPUT_TOKENS: Readonly<Record<string, number>> = {
    [LLM_TASKS.summaryMonth]: 40_000,
    [LLM_TASKS.summaryCuts]: 40_000,
    [LLM_TASKS.summaryPortfolio]: 40_000,
    [LLM_TASKS.summaryMonthlyReview]: 40_000,
    [LLM_TASKS.askVeraStep]: 100_000,
    [LLM_TASKS.askVeraAppStep]: 100_000,
    [LLM_TASKS.investmentExtract]: 60_000,
    [LLM_TASKS.statementExtract]: 60_000,
    [LLM_TASKS.marketDocumentSummary]: 20_000
};
const CAP_MICROS: number = 4_000_000;

function worstCaseMicros(spec: LlmTaskSpec): number {
    const usd: number =
        ((MAX_INPUT_TOKENS[spec.task] ?? 0) * DEV_PRICE_USD_PER_MILLION.input + spec.maxOutputTokens * DEV_PRICE_USD_PER_MILLION.output) /
        1_000_000;
    return Math.ceil(usd * DEV_USD_BRL * 1_000_000);
}

function byTask(task: string): LlmTaskSpec {
    const spec: LlmTaskSpec | undefined = LLM_TASK_CATALOG.find((entry: LlmTaskSpec): boolean => entry.task === task);
    if (spec === undefined) {
        throw new Error(`tarefa ${task} fora do catálogo`);
    }
    return spec;
}

describe('catálogo de tarefas', () => {
    it('cobre as nove tarefas da Vera, sem repetir nenhuma', () => {
        expect(LLM_TASK_CATALOG.map((spec: LlmTaskSpec): string => spec.task).sort()).toEqual(
            [
                'ask_vera_app_step',
                'ask_vera_step',
                'investment_extract',
                'market_document_summary',
                'statement_extract',
                'summary_cuts',
                'summary_month',
                'summary_monthly_review',
                'summary_portfolio'
            ].sort()
        );
    });

    it('maxCostMicros cobre o pior caso (entrada máxima prevista e maxOutputTokens) ao preço da LLM_PRICE_TABLE de dev', () => {
        for (const spec of LLM_TASK_CATALOG) {
            expect(spec.maxCostMicros).toBeGreaterThanOrEqual(worstCaseMicros(spec));
        }
    });

    it('documenta quantas chamadas cabem em R$ 4 (o número que o #104 usa)', () => {
        const summaries: number = Math.floor(CAP_MICROS / byTask(LLM_TASKS.summaryMonth).maxCostMicros);
        const askSteps: number = Math.floor(CAP_MICROS / byTask(LLM_TASKS.askVeraStep).maxCostMicros);

        expect(summaries).toBe(148);
        expect(askSteps).toBe(67);
        expect(Math.floor(CAP_MICROS / byTask(LLM_TASKS.askVeraAppStep).maxCostMicros)).toBe(67);
    });

    it('toda tarefa usa raciocínio mínimo: nos evals ao vivo ficou 3 a 4 vezes mais rápido, sem texto cortado e com a mesma nota', () => {
        for (const spec of LLM_TASK_CATALOG) {
            expect(spec.reasoning).toBe('minimal');
        }
    });

    it('toda tarefa tem teto de saída, limite de tentativas e versão de prompt', () => {
        for (const spec of LLM_TASK_CATALOG) {
            expect(spec.maxOutputTokens).toBeGreaterThan(0);
            expect(spec.maxRetries).toBeGreaterThanOrEqual(0);
            expect(spec.promptVersion.length).toBeGreaterThan(0);
        }
    });

    it('só as extrações de investimentos e de extrato usam o modelo de visão, e as duas trazem o esquema de resposta', () => {
        const vision: string[] = LLM_TASK_CATALOG.filter((spec: LlmTaskSpec): boolean => spec.model === 'vision').map(
            (spec: LlmTaskSpec): string => spec.task
        );

        expect(vision).toEqual(['investment_extract', 'statement_extract']);
        expect(byTask(LLM_TASKS.investmentExtract).responseSchema).toMatchObject({ required: ['documentType', 'currency', 'operations'] });
        expect(byTask(LLM_TASKS.statementExtract).responseSchema).toMatchObject({ required: ['currency', 'transactions'] });
    });

    it('a leitura de extrato entra na cota de IA da conta; a de investimentos continua fora', () => {
        expect(byTask(LLM_TASKS.statementExtract).outsideCap).toBeUndefined();
        expect(byTask(LLM_TASKS.investmentExtract).outsideCap).toBe(true);
    });
});
