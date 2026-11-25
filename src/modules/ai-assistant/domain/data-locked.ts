import { JsonObject } from '../../../core/llm/llm.types';
import { AppLocale } from '../../../shared/i18n/locale';

export const DATA_LOCKED_TOOL: string = 'data_locked';

export const DATA_LOCKS: { readonly premium: 'premium'; readonly permission: 'permission' } = {
    premium: 'premium',
    permission: 'permission'
} as const;
export type DataLock = (typeof DATA_LOCKS)[keyof typeof DATA_LOCKS];

const PLAN_LINK: string = '/settings/plan';
const PRIVACY_LINK: string = '/settings/privacy';

const TEXTS: Readonly<Record<DataLock, Readonly<Record<AppLocale, string>>>> = {
    premium: {
        'pt-BR': 'Responder com os números da conta e do mercado é do Premium. Diga para ver o plano e dê o link.',
        en: 'Answering with the account and market numbers is Premium. Tell them to see the plan and give the link.'
    },
    permission: {
        'pt-BR':
            'O plano permite, mas falta a pessoa permitir o envio dos números à IA. Diga para permitir em dados e privacidade e dê o link.',
        en: 'The plan allows it, but the person has not allowed sending the figures to the AI. Tell them to allow it in data and privacy and give the link.'
    }
};

export function dataLockedPayload(lock: DataLock, locale: AppLocale): JsonObject {
    return { motivo: lock, texto: TEXTS[lock][locale], link: lock === DATA_LOCKS.premium ? PLAN_LINK : PRIVACY_LINK };
}
