import { AppLocale } from '../../../shared/i18n/locale';

export type ChatTexts = {
    readonly unlinked: string;
    readonly unsupported: string;
    readonly help: string;
    readonly premiumEnded: string;
    readonly noConsent: string;
    readonly limited: string;
    readonly expiredConfirmation: string;
    readonly unavailable: string;
    readonly done: string;
    readonly canceled: string;
    readonly confirmLabel: string;
    readonly cancelLabel: string;
    readonly remindersUnavailable: string;
};

const TEXTS: Readonly<Record<AppLocale, ChatTexts>> = {
    'pt-BR': {
        unlinked: 'Este número não está vinculado a uma conta da Vera. Vincule em Configurações › WhatsApp.',
        unsupported: 'Por enquanto a Vera lê só texto.',
        help: 'Pergunte sobre a carteira ou os gastos, peça para marcar uma reunião ou criar um lembrete.',
        premiumEnded: 'O Premium desta conta terminou. A Vera parou de responder por aqui.',
        noConsent:
            'Para responder perguntas, a Vera precisa da sua permissão para enviar totais agregados a um modelo de linguagem, ' +
            'por um serviço da Vercel. Ligue em Configurações › Dados e privacidade.',
        limited: 'Muitas perguntas seguidas. Tente de novo em alguns minutos.',
        expiredConfirmation: 'Essa confirmação venceu. Peça de novo.',
        unavailable: 'A Vera não conseguiu responder agora. Tente de novo em alguns minutos.',
        done: 'Feito.',
        canceled: 'Cancelado.',
        confirmLabel: 'Confirmar',
        cancelLabel: 'Cancelar',
        remindersUnavailable: 'Os lembretes ainda não estão disponíveis por aqui.'
    },
    en: {
        unlinked: 'This number is not linked to a Vera account. Link it in Settings › WhatsApp.',
        unsupported: 'For now Vera reads text only.',
        help: 'Ask about your portfolio or spending, or ask me to book a meeting or create a reminder.',
        premiumEnded: 'Premium on this account has ended. Vera stopped answering here.',
        noConsent:
            'To answer questions, Vera needs your permission to send aggregated totals to a language model, ' +
            'through a Vercel service. Turn it on in Settings › Data and privacy.',
        limited: 'Too many questions in a row. Try again in a few minutes.',
        expiredConfirmation: 'That confirmation expired. Ask again.',
        unavailable: 'Vera could not answer right now. Try again in a few minutes.',
        done: 'Done.',
        canceled: 'Canceled.',
        confirmLabel: 'Confirm',
        cancelLabel: 'Cancel',
        remindersUnavailable: 'Reminders are not available here yet.'
    }
};

export function chatTextsFor(locale: AppLocale): ChatTexts {
    return TEXTS[locale];
}

export function pausedText(locale: AppLocale, month: string): string {
    return locale === 'en'
        ? `Monthly quota used up. Vera will answer again on ${month} 1.`
        : `Cota do mês esgotada. A Vera volta a responder em 1º de ${month}.`;
}
