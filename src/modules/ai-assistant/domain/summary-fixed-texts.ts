import { AppLocale } from '../../../shared/i18n/locale';
import { moneyText, percentText } from './context/money-text';

export interface GoalMetFigures {
    readonly goalBps: number;
    readonly surplusMinor: number;
    readonly currency: string;
}

const GOAL_MET: Readonly<Record<AppLocale, (goal: string, surplus: string) => readonly string[]>> = {
    'pt-BR': (goal: string, surplus: string): readonly string[] => [
        `Você já guarda mais que a meta de ${goal}: sobram **${surplus}** acima dela. Não precisa cortar nada; esse dinheiro pode ir para o aporte.`
    ],
    en: (goal: string, surplus: string): readonly string[] => [
        `You already save more than your ${goal} goal: **${surplus}** is left above it. There is nothing to cut; that money can go to your next contribution.`
    ]
};

export function goalMetText(figures: GoalMetFigures, locale: AppLocale): readonly string[] {
    return GOAL_MET[locale](percentText(figures.goalBps, locale), moneyText(figures.surplusMinor, figures.currency, locale));
}
