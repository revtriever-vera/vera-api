import { describe, expect, it } from 'vitest';
import { LLM_TASK_CATALOG } from '../../src/core/llm/catalog/llm-task.catalog';
import { Baseline } from './baseline';
import { EvalCase, EvalTask } from './case.schemas';
import { casesOf, EVAL_TASKS } from './cases';
import { checkOutput, CheckOutcome, languageOf, sentencesIn } from './checks';
import { problemsOf } from './cli';
import { engineOf } from './engine';
import { isFixed } from './generate';
import { summaryOf, TaskSummary } from './report';
import { runTask, TaskRun } from './run';

const MIN_PT_CASES: number = 8;
const MIN_EN_CASES: number = 4;

function caseOf(task: EvalTask, id: string): EvalCase {
    const found: EvalCase | undefined = casesOf(task).find((item: EvalCase): boolean => item.id === id);
    if (found === undefined) {
        throw new Error(`case ${id} not found`);
    }
    return found;
}

function answered(item: EvalCase, paragraphs: readonly string[]): CheckOutcome {
    return checkOutput({ item, text: JSON.stringify({ paragraphs }), stopReason: 'end', fixed: false });
}

function checksOf(outcome: CheckOutcome): string[] {
    return outcome.failures.map((failure): string => failure.check);
}

describe('casos de eval', () => {
    it.each(EVAL_TASKS)('%s tem o mínimo de casos por idioma e ids únicos', (task: EvalTask) => {
        const cases: EvalCase[] = casesOf(task);

        expect(cases.filter((item: EvalCase): boolean => item.locale === 'pt-BR').length).toBeGreaterThanOrEqual(MIN_PT_CASES);
        expect(cases.filter((item: EvalCase): boolean => item.locale === 'en').length).toBeGreaterThanOrEqual(MIN_EN_CASES);
        expect(new Set(cases.map((item: EvalCase): string => item.id)).size).toBe(cases.length);
    });

    it('toda tarefa avaliada está no catálogo com limiar de eval', () => {
        for (const task of EVAL_TASKS) {
            expect(LLM_TASK_CATALOG.find((spec): boolean => spec.task === task)?.evalThreshold).toBeGreaterThan(0);
        }
    });

    it('a referência de cada caso passa nas checagens duras', () => {
        const everyCase: EvalCase[] = EVAL_TASKS.flatMap((task: EvalTask): EvalCase[] => casesOf(task));

        for (const item of everyCase) {
            const outcome: CheckOutcome = isFixed(item)
                ? checkOutput({ item, text: '', stopReason: 'end', fixed: true })
                : answered(item, item.reference);
            expect(outcome.failures, `${item.task}/${item.id}`).toEqual([]);
        }
    });

    it('meta batida nos cortes vai ao texto fixo, sem modelo', () => {
        expect(isFixed(caseOf('summary_cuts', 'meta-batida'))).toBe(true);
        expect(isFixed(caseOf('summary_cuts', 'referencia-prototipo'))).toBe(false);
    });
});

describe('checagens', () => {
    const item: EvalCase = caseOf('summary_month', 'referencia-prototipo');

    it('reprova número fora do contexto', () => {
        const outcome: CheckOutcome = answered(item, [
            'Entraram **R$ 28.000** e saíram R$ 99.999 neste mês.',
            'Você guardou R$ 5.600 da renda.',
            'Foi o mês.'
        ]);

        expect(checksOf(outcome)).toEqual(['number']);
    });

    it('reprova exclamação, menção a IA e conselho', () => {
        expect(checksOf(answered(item, ['Entraram **R$ 28.000**!', 'Você guardou R$ 5.600.', 'Foi o mês.']))).toEqual(['forbidden_term']);
        expect(checksOf(answered(item, ['Entraram **R$ 28.000**.', 'Você guardou R$ 5.600.', 'Compre mais.']))).toEqual(['forbidden_term']);
    });

    it('reprova frases demais, idioma trocado e menção ao assistente', () => {
        const long: string[] = ['Entraram **R$ 28.000**. Você guardou R$ 5.600.', 'Foi o mês. Sobrou dinheiro.', 'Está bom.'];

        expect(checksOf(answered(item, long))).toContain('sentences');
        expect(checksOf(answered(item, ['**R$ 28.000** came in.', 'You saved R$ 5.600 this month.', 'That is the month.']))).toContain(
            'language'
        );
        expect(
            checksOf(answered(item, ['Entraram **R$ 28.000**.', 'Você guardou R$ 5.600.', 'O assistente avisa que foi o mês.']))
        ).toContain('tone');
    });

    it('reprova texto vazio, truncado e fora do formato', () => {
        const base = { item, fixed: false } as const;

        expect(checksOf(checkOutput({ ...base, text: '', stopReason: 'end' }))).toEqual(['empty']);
        expect(checksOf(checkOutput({ ...base, text: '{"paragraphs":["a', stopReason: 'max_tokens' }))).toEqual(['truncated']);
        expect(checksOf(checkOutput({ ...base, text: 'sem json', stopReason: 'end' }))).toEqual(['schema']);
    });

    it('exige o número principal citado', () => {
        const outcome: CheckOutcome = answered(item, ['Sobraram R$ 5.600 no mês.', 'A taxa foi de 20% da renda.', 'A meta é de 25%.']);

        expect(checksOf(outcome)).toEqual(['expected_text']);
    });

    it('conta frases e detecta o idioma', () => {
        expect(sentencesIn('Entraram R$ 28.000. Saíram R$ 22.400? Sobrou o resto.')).toBe(3);
        expect(languageOf('Você guardou mais do que a meta para o mês')).toBe('pt-BR');
        expect(languageOf('You saved more than the goal for the month')).toBe('en');
    });
});

describe('rodada no modo mock', () => {
    it('passa nas quatro checagens e no juiz mockado com a referência dos casos', async () => {
        const run: TaskRun = await runTask(
            engineOf({ mode: 'mock', baseUrl: undefined, model: undefined, maxUsd: 1 }),
            'summary_portfolio',
            {
                reps: 1,
                judge: true,
                reasoning: undefined
            }
        );
        const summary: TaskSummary = summaryOf(run, 5.5);

        expect(summary.failedCases).toBe(0);
        expect(summary.judgeAverage).toBe(5);
        expect(problemsOf([summary], null)).toEqual([]);
    });

    it('aponta nota do juiz abaixo do limiar e queda frente à baseline', async () => {
        const run: TaskRun = await runTask(engineOf({ mode: 'mock', baseUrl: undefined, model: undefined, maxUsd: 1 }), 'summary_month', {
            reps: 1,
            judge: true,
            reasoning: undefined
        });
        const low: TaskSummary = { ...summaryOf(run, 5.5), judgeAverage: 3.2, belowThreshold: true };
        const baseline: Baseline = {
            updatedAt: '2026-11-23',
            model: 'm',
            tasks: {
                summary_month: { promptVersion: 'v1', reasoning: 'minimal', judgeAverage: 4.5, averageLatencyMs: 1, costBrlPerRun: 0 }
            }
        };

        const problems: string[] = problemsOf([low], baseline);

        expect(problems).toHaveLength(2);
        expect(problems[0]).toContain('below the threshold');
        expect(problems[1]).toContain('baseline');
    });

    it('para quando o custo passa do orçamento', async () => {
        const run: TaskRun = await runTask(engineOf({ mode: 'mock', baseUrl: undefined, model: undefined, maxUsd: 0 }), 'summary_month', {
            reps: 1,
            judge: false,
            reasoning: undefined
        });

        expect(run.stoppedByBudget).toBe(true);
    });
});
