import { AppLocale } from '../../../../shared/i18n/locale';
import { summaryPromptOf } from './summary-rules.prompt';

const TASK: Readonly<Record<AppLocale, string>> = {
    'pt-BR':
        'Tarefa: parágrafo do Raio-X do mês da carteira, em no máximo 4 frases. O JSON traz só percentuais do mês (mes é o mês avaliado). ' +
        '(1) Comece pelo número: se rentabilidade_pct existir, abra com ela e compare com os índices que não forem nulos (cdi_pct, ipca_pct, ibovespa_pct), dizendo se ficou acima ou abaixo; ' +
        'se rentabilidade_pct for nulo, não fale de rentabilidade, nem da carteira nem de classes, nem compare com índices: comece pelas altas e quedas do mês. ' +
        '(2) Cite as classes de por_classe só quando a rentabilidade_pct delas existir, no máximo duas, pela de maior e pela de menor valor; classe com rentabilidade_pct nulo não ganha número nem estimativa. ' +
        '(3) Se houver maiores_altas ou maiores_quedas, cite até um ativo de cada, pelo marcador, com a variacao_pct, dizendo só que o preço subiu ou caiu. ' +
        '(4) Se proventos_pct_carteira existir, diga que a carteira recebeu proventos no mês e escreva o percentual sempre dizendo do quê, com as palavras "do valor da carteira" (ex.: "proventos equivalentes a 0,47% do valor da carteira"); nunca deixe esse percentual solto, que parece rentabilidade; sem ele, não fale de proventos. ' +
        '(5) Se concentracao.acima_do_fgc for verdadeiro, diga que há valor acima do limite do FGC; se maior_emissor_pct existir e for alto, diga que um único emissor concentra esse percentual da carteira. ' +
        'Descreva o que aconteceu, sem dizer o que fazer, sem prever o próximo mês e sem repetir o aviso de que não é recomendação de compra ou venda (o sistema o escreve).',
    en:
        'Task: paragraph of the portfolio monthly X-ray, in at most 4 sentences. The JSON only has percentages of the month (mes is the month reviewed). ' +
        '(1) Start with the number: if rentabilidade_pct exists, open with it and compare it with the indices that are not null (cdi_pct, ipca_pct, ibovespa_pct), saying whether it came out above or below; ' +
        "if rentabilidade_pct is null, do not talk about returns, neither for the portfolio nor for classes, and do not compare with indices: start with the month's rises and falls. " +
        '(2) Mention the classes in por_classe only when their rentabilidade_pct exists, at most two, the highest and the lowest; a class with null rentabilidade_pct gets no number and no estimate. ' +
        '(3) If there are maiores_altas or maiores_quedas, mention up to one asset of each, through its marker, with the variacao_pct, saying only that the price rose or fell. ' +
        '(4) If proventos_pct_carteira exists, say that the portfolio received income in the month and always say what the percentage is of, with the words "of the portfolio value" (e.g. "income equal to 0.47% of the portfolio value"); never leave that percentage alone, as it reads like a return; without it, say nothing about income. ' +
        '(5) If concentracao.acima_do_fgc is true, say there is an amount above the FGC limit; if maior_emissor_pct exists and is high, say a single issuer holds that share of the portfolio. ' +
        'Describe what happened, without saying what to do, without predicting next month and without repeating the notice that this is not a recommendation to buy or sell (the system writes it).'
};

const EXAMPLE: Readonly<Record<AppLocale, string>> = {
    'pt-BR':
        'Exemplo de saída:\n{"paragraphs":["Sua carteira rendeu **+1,20%** em outubro, acima do CDI (+0,95%) e abaixo do Ibovespa (+2,10%).",' +
        '"[[cls:acoes_br]] foi a classe de melhor resultado (+3,40%) e [[cls:rf_pos]] a de menor (+0,90%).",' +
        '"No preço, [[ativo:custom_1]] subiu +8,00% e [[ativo:custom_2]] caiu -6,00%.",' +
        '"Um único emissor concentra 32% da carteira."]}',
    en:
        'Example output:\n{"paragraphs":["Your portfolio returned **+1.20%** in October, above the CDI (+0.95%) and below the Ibovespa (+2.10%).",' +
        '"[[cls:acoes_br]] was the best class (+3.40%) and [[cls:rf_pos]] the lowest (+0.90%).",' +
        '"In price, [[ativo:custom_1]] rose +8.00% and [[ativo:custom_2]] fell -6.00%.",' +
        '"A single issuer holds 32% of the portfolio."]}'
};

export function summaryMonthlyReviewPrompt(locale: AppLocale): string {
    return summaryPromptOf(locale, TASK[locale], EXAMPLE, true);
}
