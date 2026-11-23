import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AiContext, BuiltContext, LabelSource } from '../../src/modules/ai-assistant/domain/context/ai-context.types';
import { figuresIn } from '../../src/modules/ai-assistant/domain/summary-guard';
import { EvalCase, EvalTask, evalCaseSchema } from './case.schemas';

export const EVAL_TASKS: readonly EvalTask[] = ['summary_month', 'summary_cuts', 'summary_portfolio'];

const CASES_DIR: string = join(__dirname, '..', 'cases');
const SKIPPED_FIELDS: ReadonlySet<string> = new Set(['mes', 'chave', 'status', 'situacao', 'moeda_base', 'tipo', 'rotulo_padrao']);

export function casesOf(task: EvalTask): EvalCase[] {
    const dir: string = join(CASES_DIR, task);
    return readdirSync(dir)
        .filter((name: string): boolean => name.endsWith('.json'))
        .sort()
        .map((name: string): EvalCase => evalCaseSchema.parse(JSON.parse(readFileSync(join(dir, name), 'utf8'))));
}

function collect(value: unknown, field: string, locale: EvalCase['locale'], found: Set<number>): void {
    if (SKIPPED_FIELDS.has(field)) {
        return;
    }
    if (typeof value === 'number') {
        found.add(value);
        return;
    }
    if (typeof value === 'string') {
        for (const figure of figuresIn(value, locale)) {
            found.add(Math.round(figure.value));
        }
        return;
    }
    if (typeof value === 'object' && value !== null) {
        for (const [key, inner] of Object.entries(value)) {
            collect(inner, key, locale, found);
        }
    }
}

export function numbersOf(item: EvalCase): readonly number[] {
    const found: Set<number> = new Set<number>();
    collect(item.context, '', item.locale, found);
    return [...found].sort((left: number, right: number): number => left - right);
}

export function keysOf(item: EvalCase): ReadonlyMap<string, LabelSource> {
    return new Map<string, LabelSource>(
        Object.entries(item.labels).map(([key, name]: [string, string]): [string, LabelSource] => [
            key,
            { kind: key.startsWith('cls:') ? 'cls' : 'cat', name }
        ])
    );
}

export function builtOf(item: EvalCase): BuiltContext<AiContext> {
    return { payload: item.context, numbers: numbersOf(item), keys: keysOf(item) };
}
