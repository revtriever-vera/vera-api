import { AppLocale } from '../../../../shared/i18n/locale';
import { summaryPromptOf } from './summary-rules.prompt';

const TASK: Readonly<Record<AppLocale, string>> = {
    'pt-BR':
        'Tarefa: resumo da carteira. Diga o que está fora da meta e para onde vai o próximo aporte: (1) o total e a exposição ao dólar (total, exposicao_dolar_pct); ' +
        '(2) as classes abaixo e acima da faixa (carteira_pct com situacao, atual, meta; a faixa é tolerancia_pp); ' +
        '(3) para as classes acima, a frase fixa "Não precisa vender; basta não aportar nelas por um tempo."; ' +
        '(4) só se aporte_planejado existir, termine com a frase do aporte: "Com [total] de aporte, a sugestão é ..." citando as classes de por_classe. Sem aporte_planejado, não fale de aporte.',
    en:
        'Task: portfolio summary. Say what is off target and where the next contribution goes: (1) the total and the dollar exposure (total, exposicao_dolar_pct); ' +
        '(2) the classes below and above the band (carteira_pct with situacao, atual, meta; the band is tolerancia_pp); ' +
        '(3) for classes above the band, the fixed sentence "You don\'t need to sell; just hold off on contributing to them for a while."; ' +
        '(4) only if aporte_planejado exists, end with the contribution sentence: "With [total] to contribute, the suggestion is ..." naming the classes in por_classe. Without aporte_planejado, say nothing about a contribution.'
};

const EXAMPLE: Readonly<Record<AppLocale, string>> = {
    'pt-BR':
        'Exemplo de saída:\n{"paragraphs":["Sua carteira soma **R$412.000**, com 18% em dólar.",' +
        '"[[cls:renda_fixa]] está abaixo da meta (22% contra 30%) e [[cls:acoes_br]] está acima (38% contra 30%).",' +
        '"Não precisa vender; basta não aportar nelas por um tempo.",' +
        '"Com **R$5.000** de aporte, a sugestão é R$5.000 em [[cls:renda_fixa]]."]}',
    en:
        'Example output:\n{"paragraphs":["Your portfolio adds up to **R$412,000**, with 18% in dollars.",' +
        '"[[cls:renda_fixa]] is below target (22% against 30%) and [[cls:acoes_br]] is above (38% against 30%).",' +
        '"You don\'t need to sell; just hold off on contributing to them for a while.",' +
        '"With **R$5,000** to contribute, the suggestion is R$5,000 in [[cls:renda_fixa]]."]}'
};

export function summaryPortfolioPrompt(locale: AppLocale): string {
    return summaryPromptOf(locale, TASK[locale], EXAMPLE);
}
