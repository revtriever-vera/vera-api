import { AppLocale } from '../../../../shared/i18n/locale';
import { summaryPromptOf } from './summary-rules.prompt';

const TASK: Readonly<Record<AppLocale, string>> = {
    'pt-BR':
        'Tarefa: resumo do mês. Explique o que mudou no mês e por quê, na ordem: (1) renda, gastos e quanto sobrou, com a taxa de poupança frente à meta (campos renda, gastos, guardado, taxa_poupanca, meta_economia_pct); ' +
        '(2) os gastos flexíveis que mais subiram sobre a média de 3 meses (gastos_por_categoria com variacao_pct); (3) os gastos fixos e a parte da renda que ocupam (fixos); ' +
        '(4) só se sem_categoria.total for relevante, o que ficou sem categoria. Se parcial for verdadeiro, diga que o mês ainda não acabou.',
    en:
        'Task: month summary. Explain what changed in the month and why, in this order: (1) income, expenses and how much was left, with the savings rate against the goal (fields renda, gastos, guardado, taxa_poupanca, meta_economia_pct); ' +
        '(2) the flexible spending that rose most over the 3-month average (gastos_por_categoria with variacao_pct); (3) fixed spending and the share of income it takes (fixos); ' +
        '(4) only if sem_categoria.total is relevant, what is still uncategorized. If parcial is true, say the month is not over.'
};

const EXAMPLE: Readonly<Record<AppLocale, string>> = {
    'pt-BR':
        'Exemplo de saída:\n{"paragraphs":["Entraram **R$28.000** e saíram R$22.400. Você guardou R$5.600, 20% da renda: 5 pontos abaixo da meta de 25%.",' +
        '"A diferença veio dos gastos flexíveis: [[cat:delivery]] (+38% sobre a sua média) e [[cat:lazer]] (+21%).",' +
        '"Os fixos ([[cat:moradia]], [[cat:saude]]) somam **R$11.200**, 40% da renda, sem mudança.",' +
        '"R$1.900 ficaram sem categoria, em 14 transações."]}',
    en:
        'Example output:\n{"paragraphs":["**R$28,000** came in and R$22,400 went out. You saved R$5,600, 20% of income: 5 points below your 25% goal.",' +
        '"The gap came from flexible spending: [[cat:delivery]] (+38% over your average) and [[cat:lazer]] (+21%).",' +
        '"Fixed costs ([[cat:moradia]], [[cat:saude]]) add up to **R$11,200**, 40% of income, unchanged.",' +
        '"R$1,900 is still uncategorized, in 14 transactions."]}'
};

export function summaryMonthPrompt(locale: AppLocale): string {
    return summaryPromptOf(locale, TASK[locale], EXAMPLE);
}
