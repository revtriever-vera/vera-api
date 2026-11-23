import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CheckFailure } from './checks';
import { CaseRow, RepResult, TaskRun } from './run';

export interface TaskSummary {
    readonly task: string;
    readonly promptVersion: string;
    readonly reasoning: string;
    readonly cases: number;
    readonly failedCases: number;
    readonly emptyRate: number;
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

function modelReps(run: TaskRun): RepResult[] {
    return repsOf(run).filter((rep: RepResult): boolean => rep.generation !== null && !rep.generation.fixed);
}

function costUsdOf(reps: readonly RepResult[]): number {
    return reps.reduce((sum: number, rep: RepResult): number => sum + (rep.generation?.costUsd ?? 0) + (rep.verdict?.costUsd ?? 0), 0);
}

function scoresOf(reps: readonly RepResult[]): number[] {
    return reps.flatMap((rep: RepResult): number[] => (rep.verdict === null ? [] : [rep.verdict.score]));
}

function emptyRateOf(reps: readonly RepResult[]): number {
    const empty: number = reps.filter((rep: RepResult): boolean =>
        rep.failures.some((failure: CheckFailure): boolean => failure.check === 'empty')
    ).length;
    return empty / Math.max(1, reps.length);
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
        failedCases: run.rows.filter((row: CaseRow): boolean => failuresOf(row).length > 0).length,
        emptyRate: emptyRateOf(reps),
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
    return `  ${passed === row.reps.length ? 'ok  ' : 'FAIL'} ${row.id} (${String(passed)}/${String(row.reps.length)})${reason === '' ? '' : ` ${reason}`}`;
}

export function tableOf(run: TaskRun): string {
    return [run.task, ...run.rows.map(rowLine)].join('\n');
}

export function summaryLine(summary: TaskSummary): string {
    const judge: string = summary.judgeAverage === null ? 'no judge' : `judge ${summary.judgeAverage.toFixed(2)}/5`;
    const ok: number = summary.cases - summary.failedCases;
    return `${summary.task} [${summary.promptVersion}, reasoning ${summary.reasoning}]: ${String(ok)}/${String(summary.cases)} cases, ${judge}, empty ${(summary.emptyRate * 100).toFixed(0)}%, ${summary.averageLatencyMs.toFixed(0)} ms, ${summary.averageOutputTokens.toFixed(0)} output tokens, R$ ${summary.costBrl.toFixed(4)}`;
}

export function writeReport(runs: readonly TaskRun[], summaries: readonly TaskSummary[]): string {
    mkdirSync(OUT_DIR, { recursive: true });
    const file: string = join(OUT_DIR, `${new Date().toISOString().replaceAll(':', '-')}.json`);
    writeFileSync(file, `${JSON.stringify({ summaries, runs }, null, 2)}\n`);
    return file;
}
