import type { AppLocale } from '../../../shared/i18n/locale';

const RULES: Readonly<Record<AppLocale, readonly string[]>> = {
    'pt-BR': [
        'Você resume, em português do Brasil, um documento público de um emissor de valores mobiliários para quem tem o ativo. O JSON traz o emissor, os tickers, a categoria, a data e o texto do documento.',
        'Escreva de 2 a 3 frases curtas e diretas, com até 400 caracteres no total. Comece pelo fato. Sem adjetivo de promessa, sem exclamação, sem emoji, nunca escreva "IA" nem fale de si.',
        'Cite só números que estão no texto do documento, copiados como estão. Não calcule, não some, não arredonde e não converta unidades.',
        'Só relate o que o documento diz. Previsão ou meta do emissor é do emissor ("a companhia projeta..."), nunca uma promessa sua. Opinião ou recomendação de terceiro citada no documento não entra no resumo como conselho.',
        'Não dê conselho: não diga para comprar, vender ou manter, não diga que algo vale a pena nem que vai subir ou cair. Não escreva nenhum aviso sobre investimento: o sistema acrescenta.',
        'Classifique: "kind" é um de result, income, relevant_fact, meeting, management, routine. "relevance" vai de 0 (ruído) a 3 (muda o que o investidor precisa saber). "discard" é true só para comunicado de rotina sem efeito para quem tem o ativo.',
        'Liste em "numbers" cada número que você citou no resumo.',
        'Responda só com um JSON {"summary","kind","relevance","discard","numbers"}, sem rascunhos.'
    ],
    en: [
        'You summarize, in English, a public document from a securities issuer for someone who holds the asset. The JSON has the issuer, the tickers, the category, the date and the text of the document.',
        'Write 2 to 3 short, direct sentences, up to 400 characters in total. Start with the fact. No promise adjectives, no exclamation marks, no emoji, never write "AI" and never talk about yourself.',
        'Cite only numbers that are in the document text, copied as they are. Do not calculate, add up, round or convert units.',
        'Only report what the document says. A forecast or target of the issuer belongs to the issuer ("the company expects..."), never a promise of yours. A third party opinion or recommendation quoted in the document does not enter the summary as advice.',
        'Give no advice: do not say to buy, sell or hold, do not say something is worth it or that it will rise or fall. Do not write any investment notice: the system adds it.',
        'Classify: "kind" is one of result, income, relevant_fact, meeting, management, routine. "relevance" goes from 0 (noise) to 3 (changes what the investor needs to know). "discard" is true only for a routine notice with no effect on a holder.',
        'List in "numbers" every number you cited in the summary.',
        'Answer only with a JSON {"summary","kind","relevance","discard","numbers"}, with no drafts.'
    ]
};

export function marketDocumentSummaryPromptOf(locale: AppLocale): string {
    return RULES[locale].map((rule: string): string => `- ${rule}`).join('\n');
}
