import { AppLocale } from '../../../shared/i18n/locale';
import { AskRoute } from './ask-channel-profiles';

type Replies = Readonly<Record<AppLocale, string>>;

const PIX_REFUSAL: Replies = {
    'pt-BR': 'A Vera não faz Pix, pagamentos nem transferências: ela só lê seus dados. Use o app do seu banco.',
    en: 'Vera does not make Pix, payments or transfers: she only reads your data. Use your bank app.'
};

const GREETING: Replies = {
    'pt-BR': 'Oi. Pergunte sobre a carteira ou os gastos, peça para marcar uma reunião ou criar um lembrete.',
    en: 'Hi. Ask about your portfolio or spending, or ask me to book a meeting or create a reminder.'
};

const APP_HELP_GREETING: Replies = {
    'pt-BR': 'Oi. Pergunte como usar a Vera: onde fica uma tela ou o que cada uma faz.',
    en: 'Hi. Ask how to use Vera: where a screen is or what each one does.'
};

const APP_AI_GREETING: Replies = {
    'pt-BR': 'Oi. Pergunte sobre a carteira ou os gastos, ou como usar a Vera.',
    en: 'Hi. Ask about your portfolio or spending, or how to use Vera.'
};

const FAILURE: Replies = {
    'pt-BR': 'Não consegui responder isso agora. Tente perguntar de outro jeito.',
    en: 'I could not answer that right now. Try asking in a different way.'
};

const INVESTMENT_NOTICE: Replies = {
    'pt-BR': 'Isto não é uma recomendação de compra ou venda.',
    en: 'This is not a recommendation to buy or sell.'
};

export const INVESTMENT_NOTICE_PHRASES: readonly RegExp[] = [
    /isto n[aã]o [eé] uma recomenda[çc][ãa]o de compra ou venda\.?/giu,
    /this is not a recommendation to buy or sell\.?/giu
];

export function pixRefusalText(locale: AppLocale): string {
    return PIX_REFUSAL[locale];
}

export function greetingText(locale: AppLocale, route: AskRoute): string {
    if (route.channel === 'whatsapp') {
        return GREETING[locale];
    }
    return route.feature === 'help' ? APP_HELP_GREETING[locale] : APP_AI_GREETING[locale];
}

export function failureText(locale: AppLocale): string {
    return FAILURE[locale];
}

export function investmentNoticeText(locale: AppLocale): string {
    return INVESTMENT_NOTICE[locale];
}
