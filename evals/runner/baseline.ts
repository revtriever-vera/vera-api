import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { baselineSchema } from './baseline.schemas';
import { z } from 'zod';
import { TaskSummary } from './report';

const BASELINE_FILE: string = join(__dirname, '..', 'baseline.json');
const MAX_DROP: number = 0.5;

export type Baseline = z.infer<typeof baselineSchema>;

export function readBaseline(): Baseline | null {
    return existsSync(BASELINE_FILE) ? baselineSchema.parse(JSON.parse(readFileSync(BASELINE_FILE, 'utf8'))) : null;
}

export function regressionOf(summary: TaskSummary, baseline: Baseline | null): string | null {
    const previous: Baseline['tasks'][string] | undefined = baseline?.tasks[summary.task];
    if (previous === undefined || summary.judgeAverage === null || previous.promptVersion !== summary.promptVersion) {
        return null;
    }
    return summary.judgeAverage < previous.judgeAverage - MAX_DROP
        ? `${summary.task}: judge ${summary.judgeAverage.toFixed(2)} fell more than ${String(MAX_DROP)} below the baseline ${previous.judgeAverage.toFixed(2)}`
        : null;
}

export function writeBaseline(summaries: readonly TaskSummary[], model: string): void {
    const tasks: Baseline['tasks'] = Object.fromEntries(
        summaries
            .filter((summary: TaskSummary): boolean => summary.judgeAverage !== null)
            .map((summary: TaskSummary): [string, Baseline['tasks'][string]] => [
                summary.task,
                {
                    promptVersion: summary.promptVersion,
                    reasoning: summary.reasoning,
                    judgeAverage: Number((summary.judgeAverage ?? 0).toFixed(2)),
                    averageLatencyMs: Math.round(summary.averageLatencyMs),
                    costBrlPerRun: Number(summary.costBrl.toFixed(4))
                }
            ])
    );
    const baseline: Baseline = { updatedAt: new Date().toISOString().slice(0, 10), model, tasks };
    writeFileSync(BASELINE_FILE, `${JSON.stringify(baseline, null, 2)}\n`);
}
