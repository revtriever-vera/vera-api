import { AppLocale } from '../../../shared/i18n/locale';

export type LinkTexts = {
    readonly welcome: string;
    readonly invalidCode: string;
    readonly phoneInUse: string;
    readonly unlinked: string;
};

const TEXTS: Readonly<Record<AppLocale, LinkTexts>> = {
    'pt-BR': {
        welcome:
            'Número confirmado. Exemplos do que você pode mandar: "quanto gastei este mês?" ou "como está minha carteira?". ' +
            'Pix e pagamentos a Vera não faz.',
        invalidCode: 'Esse código não vale mais. Gere um novo em Configurações › WhatsApp.',
        phoneInUse: 'Este número já está vinculado a outra conta da Vera. Desvincule lá antes.',
        unlinked: 'Número desvinculado. A Vera não vai mais responder aqui. Para vincular de novo, use Configurações › WhatsApp.'
    },
    en: {
        welcome:
            'Number confirmed. Examples of what you can send: "how much did I spend this month?" or "how is my portfolio?". ' +
            'Vera does not make Pix transfers or payments.',
        invalidCode: 'This code is no longer valid. Generate a new one in Settings › WhatsApp.',
        phoneInUse: 'This number is already linked to another Vera account. Unlink it there first.',
        unlinked: 'Number unlinked. Vera will no longer reply here. To link again, use Settings › WhatsApp.'
    }
};

export function linkTextsFor(locale: AppLocale): LinkTexts {
    return TEXTS[locale];
}
