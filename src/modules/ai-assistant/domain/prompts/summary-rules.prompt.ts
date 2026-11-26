import { AppLocale } from '../../../../shared/i18n/locale';

const RULES: Readonly<Record<AppLocale, readonly string[]>> = {
    'pt-BR': [
        'Você escreve um resumo curto, em português do Brasil, a partir dos números de um JSON. O JSON traz só totais e proporções já formatados.',
        'Tom de voz: comece pelo número; uma ideia por frase; frases curtas e diretas; sem adjetivo de promessa; sem exclamação; sem emoji; nunca escreva "IA" nem fale de si.',
        'Cite só números que aparecem no JSON, copiados como estão (por exemplo "R$ 28.000" e "12%"). Não calcule, não some, não arredonde e não invente porcentagens.',
        'Nunca use o nome de uma categoria ou de uma classe. Escreva o marcador [[cat:chave]] para categoria ou [[cls:chave]] para classe, com a "chave" exata do JSON. O sistema troca o marcador pelo nome.',
        'Não dê conselho de investimento: não diga para comprar, vender ou escolher ativo, não cite ativos nem prometa retorno.',
        'Coloque o número principal de cada parágrafo entre ** **, no máximo um por parágrafo (por exemplo "**R$ 3.200**").',
        'Responda só com um JSON {"paragraphs": [...]}: de 1 a 4 parágrafos, cada um com até 280 caracteres, texto simples sem HTML, 3 ou 4 frases no total.',
        'Seja direto: escreva o JSON assim que tiver os números, sem rascunhos nem listas de alternativas.'
    ],
    en: [
        'You write a short summary in English from the numbers in a JSON. The JSON only has totals and shares, already formatted.',
        'Voice: start with the number; one idea per sentence; short, direct sentences; no promise adjectives; no exclamation marks; no emoji; never write "AI" and never talk about yourself.',
        'Cite only numbers that appear in the JSON, copied as they are (for example "R$28,000" and "12%"). Do not calculate, add up, round or invent percentages.',
        'Never use the name of a category or a class. Write the marker [[cat:key]] for a category or [[cls:key]] for a class, with the exact "chave" from the JSON. The system swaps the marker for the name.',
        'Give no investment advice: do not say to buy, sell or pick an asset, do not mention assets and do not promise returns.',
        'Wrap the main number of each paragraph in ** ** (at most one per paragraph, for example "**R$3,200**").',
        'Answer only with a JSON {"paragraphs": [...]}: 1 to 4 paragraphs, each up to 280 characters, plain text with no HTML, 3 or 4 sentences in total.',
        'Be direct: write the JSON as soon as you have the numbers, with no drafts and no lists of alternatives.'
    ]
};

const ASSET_RULE_INDEX: number = 3;
const ADVICE_RULE_INDEX: number = 4;

const ASSET_RULES: Readonly<Record<AppLocale, { readonly marker: string; readonly advice: string }>> = {
    'pt-BR': {
        marker: 'Nunca use o nome de uma classe nem o código de um ativo. Escreva o marcador [[cls:chave]] para classe ou [[ativo:chave]] para ativo, com a "chave" exata do JSON. O sistema troca o marcador pelo nome.',
        advice: 'Não dê conselho de investimento: não diga para comprar, vender, trocar ou aumentar posição, não prometa retorno nem diga que o movimento vai continuar. Ativo só aparece pelo marcador, para dizer quanto o preço subiu ou caiu no mês.'
    },
    en: {
        marker: 'Never use the name of a class or the code of an asset. Write the marker [[cls:key]] for a class or [[ativo:key]] for an asset, with the exact "chave" from the JSON. The system swaps the marker for the name.',
        advice: 'Give no investment advice: do not say to buy, sell, swap or increase a position, do not promise returns and do not say the move will continue. An asset appears only through its marker, to say how much its price rose or fell in the month.'
    }
};

export function summaryRulesOf(locale: AppLocale, withAssets: boolean = false): string {
    const rules: readonly string[] = withAssets
        ? RULES[locale].map((rule: string, index: number): string => {
              if (index === ASSET_RULE_INDEX) {
                  return ASSET_RULES[locale].marker;
              }
              return index === ADVICE_RULE_INDEX ? ASSET_RULES[locale].advice : rule;
          })
        : RULES[locale];
    return rules.map((rule: string): string => `- ${rule}`).join('\n');
}

export function summaryPromptOf(
    locale: AppLocale,
    task: string,
    example: Readonly<Record<AppLocale, string>>,
    withAssets: boolean = false
): string {
    return `${task}\n\n${summaryRulesOf(locale, withAssets)}\n\n${example[locale]}`;
}
