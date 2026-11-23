import { LlmTaskSpec } from '../../src/core/llm/catalog/llm-task.types';
import { LlmReasoning } from '../../src/core/llm/llm.types';
import { EvalCase, EvalTask } from './case.schemas';
import { casesOf } from './cases';
import { CheckFailure, CheckOutcome, checkOutput } from './checks';
import { BudgetExceededError, Engine } from './engine';
import { generate, Generation, specOf } from './generate';
import { judge, JudgeVerdict } from './judge';

export interface RunOptions {
    readonly reps: number;
    readonly judge: boolean;
    readonly reasoning: LlmReasoning | undefined;
}

export interface RepResult {
    readonly failures: readonly CheckFailure[];
    readonly verdict: JudgeVerdict | null;
    readonly generation: Generation | null;
}

export interface CaseRow {
    readonly id: string;
    readonly reps: readonly RepResult[];
}

export interface TaskRun {
    readonly task: EvalTask;
    readonly spec: LlmTaskSpec;
    readonly rows: readonly CaseRow[];
    readonly stoppedByBudget: boolean;
}

const BAD_GATEWAY: CheckFailure = { check: 'provider', detail: 'the provider call failed' };

async function generated(engine: Engine, spec: LlmTaskSpec, item: EvalCase): Promise<Generation | CheckFailure> {
    try {
        return await generate(engine, spec, item);
    } catch (error: unknown) {
        if (error instanceof BudgetExceededError) {
            throw error;
        }
        return BAD_GATEWAY;
    }
}

async function judged(
    engine: Engine,
    spec: LlmTaskSpec,
    item: EvalCase,
    outcome: CheckOutcome,
    enabled: boolean
): Promise<JudgeVerdict | null> {
    if (!enabled || outcome.failures.length > 0) {
        return null;
    }
    return judge(engine, spec, item, outcome.rendered);
}

async function repOf(engine: Engine, spec: LlmTaskSpec, item: EvalCase, withJudge: boolean): Promise<RepResult> {
    const attempt: Generation | CheckFailure = await generated(engine, spec, item);
    if ('check' in attempt) {
        return { failures: [attempt], verdict: null, generation: null };
    }
    const outcome: CheckOutcome = checkOutput({ item, text: attempt.text, stopReason: attempt.stopReason, fixed: attempt.fixed });
    return { failures: outcome.failures, verdict: await judged(engine, spec, item, outcome, withJudge), generation: attempt };
}

async function rowOf(engine: Engine, spec: LlmTaskSpec, item: EvalCase, options: RunOptions): Promise<CaseRow> {
    const reps: RepResult[] = [];
    for (let rep: number = 0; rep < options.reps; rep += 1) {
        reps.push(await repOf(engine, spec, item, options.judge));
    }
    return { id: item.id, reps };
}

export async function runTask(engine: Engine, task: EvalTask, options: RunOptions): Promise<TaskRun> {
    const spec: LlmTaskSpec = specOf(task, options.reasoning);
    const rows: CaseRow[] = [];
    try {
        for (const item of casesOf(task)) {
            rows.push(await rowOf(engine, spec, item, options));
        }
    } catch (error: unknown) {
        if (error instanceof BudgetExceededError) {
            return { task, spec, rows, stoppedByBudget: true };
        }
        throw error;
    }
    return { task, spec, rows, stoppedByBudget: false };
}
