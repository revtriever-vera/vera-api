import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CheckFailure, isEmptyCall } from './checks';
import { CallTrace } from './generate';
import { CaseRow, RepResult, TaskRun } from './run';

export interface TaskSummary {
    readonly task: string;
    readonly promptVersion: string;
    readonly reasoning: string;
    readonly cases: number;
    readonly failedCases: number;
    readonly failedRepRate: number;
    readonly emptyRate: number;
    readonly emptyCallRate: number;
    readonly truncatedRate: number;
    readonly toolRate: number | null;
    readonly pendingToolRate: number | null;
    readonly generationCostBrl: number;
    readonly judgeAverage: number | null;
    readonly judgeThreshold: number;
    readonly belowThreshold: boolean;
    readonly costBrl: number;
    readonly averageLatencyMs: number;
    readonly averageOutputTokens: number;
    readonly stoppedByBudget: boolean;
}

const OUT_DIR: string = join(__dirname, '..', 'out');
const MAX_SCORE: number = 5;

function mean(values: readonly number[]): number | null {
    return values.length === 0 ? null : values.reduce((sum: number, value: number): number => sum + value, 0) / values.length;
}

function repsOf(run: TaskRun): RepResult[] {
    return run.rows.flatMap((row: CaseRow): readonly RepResult[] => row.reps);
}

export function failuresOf(row: CaseRow): CheckFailure[] {
    return row.reps.flatMap((rep: RepResult): readonly CheckFailure[] => rep.failures);
}

const PENDING_INFO_CHECKS: ReadonlySet<string> = new Set(['tool_missing', 'tool_unexpected']);

function countedFailuresOf(row: CaseRow): CheckFailure[] {
    return row.pending
        ? failuresOf(row).filter((failure: CheckFailure): boolean => !PENDING_INFO_CHECKS.has(failure.check))
        : failuresOf(row);
}

function modelReps(run: TaskRun): RepResult[] {
    return repsOf(run).filter((rep: RepResult): boolean => rep.generation !== null && !rep.generation.fixed);
}

function costUsdOf(reps: readonly RepResult[]): number {
    return reps.reduce((sum: number, rep: RepResult): number => sum + (rep.generation?.costUsd ?? 0) + (rep.verdict?.costUsd ?? 0), 0);
}

function scoresOf(reps: readonly RepResult[]): number[] {
    return reps.flatMap((rep: RepResult): number[] => (rep.verdict === null ? [] : [rep.verdict.score]));
}

function rateOfCheck(reps: readonly RepResult[], check: string): number {
    const hit: number = reps.filter((rep: RepResult): boolean =>
        rep.failures.some((failure: CheckFailure): boolean => failure.check === check)
    ).length;
    return hit / Math.max(1, reps.length);
}

function emptyCallRateOf(reps: readonly RepResult[]): number {
    const calls: CallTrace[] = reps.flatMap((rep: RepResult): readonly CallTrace[] => rep.generation?.calls ?? []);
    return calls.filter(isEmptyCall).length / Math.max(1, calls.length);
}

function toolRateOf(run: TaskRun, pending: boolean): number | null {
    const reps: RepResult[] = run.rows
        .filter((row: CaseRow): boolean => row.toolRequired && row.pending === pending)
        .flatMap((row: CaseRow): readonly RepResult[] => row.reps);
    if (reps.length === 0) {
        return null;
    }
    const right: number = reps.filter(
        (rep: RepResult): boolean => !rep.failures.some((failure: CheckFailure): boolean => failure.check === 'tool_missing')
    ).length;
    return right / reps.length;
}

function hasCountedFailure(rep: RepResult, pending: boolean): boolean {
    return rep.failures.some((failure: CheckFailure): boolean => !(pending && PENDING_INFO_CHECKS.has(failure.check)));
}

function countedRepsOf(row: CaseRow): boolean[] {
    return row.reps.map((rep: RepResult): boolean => hasCountedFailure(rep, row.pending));
}

function failedRepRateOf(run: TaskRun): number {
    const outcomes: boolean[] = run.rows.flatMap(countedRepsOf);
    return outcomes.filter(Boolean).length / Math.max(1, outcomes.length);
}

function ratesOf(
    run: TaskRun,
    model: readonly RepResult[],
    usdBrl: number
): Pick<TaskSummary, 'emptyRate' | 'emptyCallRate' | 'truncatedRate' | 'toolRate' | 'pendingToolRate' | 'generationCostBrl'> {
    return {
        emptyRate: rateOfCheck(model, 'empty'),
        emptyCallRate: emptyCallRateOf(model),
        truncatedRate: rateOfCheck(model, 'truncated'),
        toolRate: toolRateOf(run, false),
        pendingToolRate: toolRateOf(run, true),
        generationCostBrl: (mean(model.map((rep: RepResult): number => rep.generation?.costUsd ?? 0)) ?? 0) * usdBrl
    };
}

export function summaryOf(run: TaskRun, usdBrl: number): TaskSummary {
    const reps: RepResult[] = repsOf(run);
    const model: RepResult[] = modelReps(run);
    const average: number | null = mean(scoresOf(reps));
    return {
        task: run.task,
        promptVersion: run.spec.promptVersion,
        reasoning: run.spec.reasoning,
        cases: run.rows.length,
        failedRepRate: failedRepRateOf(run),
        failedCases: run.rows.filter((row: CaseRow): boolean => countedFailuresOf(row).length > 0).length,
        ...ratesOf(run, model, usdBrl),
        judgeAverage: average,
        judgeThreshold: run.spec.evalThreshold,
        belowThreshold: average !== null && average / MAX_SCORE < run.spec.evalThreshold,
        costBrl: costUsdOf(reps) * usdBrl,
        averageLatencyMs: mean(model.map((rep: RepResult): number => rep.generation?.latencyMs ?? 0)) ?? 0,
        averageOutputTokens: mean(model.map((rep: RepResult): number => rep.generation?.outputTokens ?? 0)) ?? 0,
        stoppedByBudget: run.stoppedByBudget
    };
}

function rowLine(row: CaseRow): string {
    const failures: CheckFailure[] = failuresOf(row);
    const passed: number = row.reps.filter((rep: RepResult): boolean => rep.failures.length === 0).length;
    const reason: string = [...new Set(failures.map((failure: CheckFailure): string => `${failure.check}: ${failure.detail}`))]
        .slice(0, 2)
        .join(' | ');
    return `  ${passed === row.reps.length ? 'ok  ' : 'FAIL'} ${row.pending ? '(pending) ' : ''}${row.id} (${String(passed)}/${String(row.reps.length)})${reason === '' ? '' : ` ${reason}`}`;
}

function emptyLines(row: CaseRow): string[] {
    return row.reps.flatMap((rep: RepResult): string[] => {
        if (!rep.failures.some((failure: CheckFailure): boolean => failure.check === 'empty')) {
            return [];
        }
        const call: CallTrace | undefined = rep.generation?.calls.at(-1);
        return call === undefined
            ? []
            : [
                  `       empty ${row.id}: finish=${call.finishReason} outputTokens=${String(call.outputTokens)} reasoningTokens=${String(call.reasoningTokens)} reasoningText=${call.reasoningChars > 0 ? 'yes' : 'no'}`
              ];
    });
}

export function tableOf(run: TaskRun): string {
    return [run.task, ...run.rows.flatMap((row: CaseRow): string[] => [rowLine(row), ...emptyLines(row)])].join('\n');
}

export function questionsWithin(budgetBrl: number, summary: TaskSummary): number | null {
    return summary.generationCostBrl > 0 ? Math.floor(budgetBrl / summary.generationCostBrl) : null;
}

export function percent(value: number | null): string {
    return value === null ? 'n/a' : `${(value * 100).toFixed(0)}%`;
}

export function summaryLine(summary: TaskSummary): string {
    const judge: string = summary.judgeAverage === null ? 'no judge' : `judge ${summary.judgeAverage.toFixed(2)}/5`;
    const ok: number = summary.cases - summary.failedCases;
    return `${summary.task} [${summary.promptVersion}, reasoning ${summary.reasoning}]: ${String(ok)}/${String(summary.cases)} cases, ${judge}, empty ${percent(summary.emptyRate)} (calls ${percent(summary.emptyCallRate)}), truncated ${percent(summary.truncatedRate)}, tool ${percent(summary.toolRate)} (pending ${percent(summary.pendingToolRate)}), ${summary.averageLatencyMs.toFixed(0)} ms, ${summary.averageOutputTokens.toFixed(0)} output tokens, R$ ${summary.generationCostBrl.toFixed(4)} per question (R$ ${summary.costBrl.toFixed(4)} in the run, judge included), ${String(questionsWithin(4, summary) ?? 'n/a')} questions in R$ 4, ${String(questionsWithin(0.5, summary) ?? 'n/a')} in R$ 0.50`;
}

export function writeReport(runs: readonly TaskRun[], summaries: readonly TaskSummary[]): string {
    mkdirSync(OUT_DIR, { recursive: true });
    const file: string = join(OUT_DIR, `${new Date().toISOString().replaceAll(':', '-')}.json`);
    writeFileSync(file, `${JSON.stringify({ summaries, runs }, null, 2)}\n`);
    return file;
}
