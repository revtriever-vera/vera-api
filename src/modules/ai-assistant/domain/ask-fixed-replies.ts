import { AppLocale } from '../../../shared/i18n/locale';

type Replies = Readonly<Record<AppLocale, string>>;

const PIX_REFUSAL: Replies = {
    'pt-BR': 'A Vera não faz Pix, pagamentos nem transferências: ela só lê seus dados. Use o app do seu banco.',
    en: 'Vera does not make Pix, payments or transfers: she only reads your data. Use your bank app.'
};

const GREETING: Replies = {
    'pt-BR': 'Oi. Pergunte sobre a carteira ou os gastos, peça para marcar uma reunião ou criar um lembrete.',
    en: 'Hi. Ask about your portfolio or spending, or ask me to book a meeting or create a reminder.'
};

const FAILURE: Replies = {
    'pt-BR': 'Não consegui responder isso agora. Tente perguntar de outro jeito.',
    en: 'I could not answer that right now. Try asking in a different way.'
};

const CVM_NOTICE: Replies = {
    'pt-BR': 'Isto não é recomendação de investimento. A Vera compara a carteira com a meta que você definiu.',
    en: 'This is not investment advice. Vera compares your portfolio with the target you set.'
};

export function pixRefusalText(locale: AppLocale): string {
    return PIX_REFUSAL[locale];
}

export function greetingText(locale: AppLocale): string {
    return GREETING[locale];
}

export function failureText(locale: AppLocale): string {
    return FAILURE[locale];
}

export function cvmNoticeText(locale: AppLocale): string {
    return CVM_NOTICE[locale];
}
