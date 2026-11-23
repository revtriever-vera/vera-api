import { parseArgs } from 'node:util';
import { LlmReasoning, LLM_REASONING_LEVELS } from '../../src/core/llm/llm.types';
import { EvalTask } from './case.schemas';
import { EVAL_TASKS } from './cases';
import { CLI_OPTIONS } from './cli.schemas';
import { Baseline, readBaseline, regressionOf, writeBaseline } from './baseline';
import { Engine, engineOf, EvalMode } from './engine';
import { summaryLine, summaryOf, TaskSummary, tableOf, writeReport } from './report';
import { runTask, TaskRun } from './run';

interface Cli {
    readonly tasks: readonly EvalTask[];
    readonly mode: EvalMode;
    readonly judge: boolean;
    readonly reps: number;
    readonly baseUrl: string | undefined;
    readonly model: string | undefined;
    readonly reasoning: LlmReasoning | undefined;
    readonly maxUsd: number;
    readonly updateBaseline: boolean;
}

function tasksOf(value: string): readonly EvalTask[] {
    if (value === 'all') {
        return EVAL_TASKS;
    }
    const found: EvalTask | undefined = EVAL_TASKS.find((task: EvalTask): boolean => task === value);
    if (found === undefined) {
        throw new Error(`unknown task "${value}"; use all or one of ${EVAL_TASKS.join(', ')}`);
    }
    return [found];
}

function reasoningOf(value: string | undefined): LlmReasoning | undefined {
    if (value === undefined) {
        return undefined;
    }
    const found: LlmReasoning | undefined = LLM_REASONING_LEVELS.find((level: LlmReasoning): boolean => level === value);
    if (found === undefined) {
        throw new Error(`unknown reasoning "${value}"; use ${LLM_REASONING_LEVELS.join(' or ')}`);
    }
    return found;
}

function modeOf(value: string): EvalMode {
    if (value !== 'mock' && value !== 'live') {
        throw new Error('--mode must be mock or live');
    }
    return value;
}

export function parseCli(argv: readonly string[]): Cli {
    const { values } = parseArgs({ args: [...argv], options: CLI_OPTIONS });
    return {
        tasks: tasksOf(values.task),
        mode: modeOf(values.mode),
        judge: values.judge,
        reps: Math.max(1, Number(values.reps)),
        baseUrl: values['base-url'],
        model: values.model,
        reasoning: reasoningOf(values.reasoning),
        maxUsd: Number(values['max-usd']),
        updateBaseline: values['update-baseline']
    };
}

function out(line: string): void {
    process.stdout.write(`${line}\n`);
}

async function runAll(cli: Cli): Promise<{ runs: TaskRun[]; summaries: TaskSummary[]; usdBrl: number; modelId: string }> {
    const engine: Engine = engineOf({ mode: cli.mode, baseUrl: cli.baseUrl, model: cli.model, maxUsd: cli.maxUsd });
    const runs: TaskRun[] = [];
    for (const task of cli.tasks) {
        const run: TaskRun = await runTask(engine, task, { reps: cli.reps, judge: cli.judge, reasoning: cli.reasoning });
        out(tableOf(run));
        runs.push(run);
    }
    const summaries: TaskSummary[] = runs.map((run: TaskRun): TaskSummary => summaryOf(run, engine.usdBrl));
    return { runs, summaries, usdBrl: engine.usdBrl, modelId: engine.credentials.modelId };
}

function isProblem(problem: string | null): problem is string {
    return problem !== null;
}

function problemsFor(summary: TaskSummary, baseline: Baseline | null): string[] {
    return [
        summary.failedCases > 0 ? `${summary.task}: ${String(summary.failedCases)} case(s) failed a hard check` : null,
        summary.belowThreshold ? `${summary.task}: judge below the threshold ${String(summary.judgeThreshold)}` : null,
        summary.stoppedByBudget ? `${summary.task}: stopped by the cost budget` : null,
        regressionOf(summary, baseline)
    ].filter(isProblem);
}

export function problemsOf(summaries: readonly TaskSummary[], baseline: Baseline | null): string[] {
    return summaries.flatMap((summary: TaskSummary): string[] => problemsFor(summary, baseline));
}

async function main(): Promise<number> {
    const cli: Cli = parseCli(process.argv.slice(2));
    const { runs, summaries, usdBrl, modelId } = await runAll(cli);
    for (const summary of summaries) {
        out(summaryLine(summary));
    }
    const total: number = summaries.reduce((sum: number, summary: TaskSummary): number => sum + summary.costBrl, 0);
    out(`total cost: R$ ${total.toFixed(4)} (US$ 1 = R$ ${String(usdBrl)})`);
    out(`report: ${writeReport(runs, summaries)}`);
    const problems: string[] = problemsOf(summaries, readBaseline());
    for (const problem of problems) {
        out(`PROBLEM ${problem}`);
    }
    if (cli.updateBaseline && problems.length === 0 && cli.judge && cli.mode === 'live') {
        writeBaseline(summaries, modelId);
    }
    return problems.length === 0 ? 0 : 1;
}

if (require.main === module) {
    main().then(
        (code: number): void => {
            process.exitCode = code;
        },
        (error: unknown): void => {
            process.stderr.write(`${error instanceof Error ? error.message : 'eval failed'}\n`);
            process.exitCode = 2;
        }
    );
}
