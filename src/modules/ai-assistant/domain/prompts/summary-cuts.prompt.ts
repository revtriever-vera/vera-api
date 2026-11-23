import { AppLocale } from '../../../../shared/i18n/locale';
import { summaryPromptOf } from './summary-rules.prompt';

const TASK: Readonly<Record<AppLocale, string>> = {
    'pt-BR':
        'Tarefa: como chegar à meta de economia. Escreva a conta da sugestão em texto: (1) quanto falta por mês para a meta (meta_economia_pct, falta_por_mes); ' +
        '(2) o caminho mais leve, que é baixar cada categoria ao limite sugerido (categorias_flexiveis com atual, cortar, limite_sugerido): cite só o valor de limite_sugerido como destino e o de atual como origem, exatamente como estão na tela, e nunca chame o limite de média nem use media_3m como destino; ' +
        '(3) se for escolher uma só categoria, a que tem o maior valor em cortar, dizendo o valor de cortar e o falta_por_mes, sem dizer que esse corte é a maior parte do que falta e sem calcular porcentagem. ' +
        'Se status for so_cortar_nao_resolve, diga que só cortar gastos flexíveis não fecha a conta e quanto ainda faltaria, sem sugerir investimento.',
    en:
        'Task: how to reach the savings goal. Write the arithmetic of the suggestion as text: (1) how much is missing per month for the goal (meta_economia_pct, falta_por_mes); ' +
        '(2) the lightest path, which is bringing each category down to its suggested limit (categorias_flexiveis with atual, cortar, limite_sugerido): cite only limite_sugerido as the destination and atual as the origin, exactly as the screen shows them, and never call the limit an average nor use media_3m as the destination; ' +
        '(3) if only one category is picked, the one with the largest cut, stating its cut and falta_por_mes, without saying that cut is most of what is missing and without computing a percentage. ' +
        'If status is so_cortar_nao_resolve, say that cutting flexible spending alone does not close the gap and how much would still be missing, without suggesting investments.'
};

const EXAMPLE: Readonly<Record<AppLocale, string>> = {
    'pt-BR':
        'Exemplo de saída:\n{"paragraphs":["Para guardar 25% da renda, faltam **R$1.400** por mês.",' +
        '"O caminho mais leve é baixar ao limite sugerido: [[cat:delivery]] (de R$1.300 para R$900) e [[cat:lazer]] (de R$800 para R$600).",' +
        '"Se for escolher uma só, comece por [[cat:delivery]]: cortar **R$400** é o maior corte, diante dos R$1.400 que faltam."]}',
    en:
        'Example output:\n{"paragraphs":["To save 25% of income, **R$1,400** per month is missing.",' +
        '"The lightest path is bringing spending down to the suggested limit: [[cat:delivery]] (from R$1,300 to R$900) and [[cat:lazer]] (from R$800 to R$600).",' +
        '"If you pick only one, start with [[cat:delivery]]: cutting **R$400** is the largest cut, against the R$1,400 that is missing."]}'
};

export function summaryCutsPrompt(locale: AppLocale): string {
    return summaryPromptOf(locale, TASK[locale], EXAMPLE);
}
