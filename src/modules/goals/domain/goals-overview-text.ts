import { AppLocale } from '../../../shared/i18n/locale';
import { FULL_SHARE_BPS, GOAL_STATUSES, GoalStatus } from './goals.types';

const MINOR_PER_MAJOR: number = 100;
const BASE_CURRENCY: string = 'BRL';
const NO_BREAK_SPACE: string = String.fromCodePoint(0xa0);

export interface OverviewGoal {
    readonly name: string;
    readonly targetMinor: number;
    readonly balanceMinor: number;
    readonly status: GoalStatus;
}

interface OverviewTexts {
    readonly empty: string;
    readonly header: string;
    readonly status: Readonly<Record<GoalStatus, string>>;
}

const TEXTS: Readonly<Record<AppLocale, OverviewTexts>> = {
    'pt-BR': {
        empty: 'Você ainda não tem objetivos. Crie o primeiro no app, em Carteira > Objetivos.',
        header: 'Seus objetivos:',
        status: {
            [GOAL_STATUSES.done]: 'Concluído',
            [GOAL_STATUSES.overdue]: 'Prazo vencido',
            [GOAL_STATUSES.behind]: 'Atrasado',
            [GOAL_STATUSES.onTrack]: 'Em dia'
        }
    },
    en: {
        empty: 'You have no goals yet. Create the first one in the app, under Portfolio > Goals.',
        header: 'Your goals:',
        status: {
            [GOAL_STATUSES.done]: 'Done',
            [GOAL_STATUSES.overdue]: 'Past the date',
            [GOAL_STATUSES.behind]: 'Behind',
            [GOAL_STATUSES.onTrack]: 'On track'
        }
    }
};

function moneyOf(minor: number, locale: AppLocale): string {
    const formatter: Intl.NumberFormat = new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: BASE_CURRENCY,
        maximumFractionDigits: 0
    });
    return formatter.format(Math.round(minor / MINOR_PER_MAJOR)).replaceAll(NO_BREAK_SPACE, ' ');
}

function percentOf(balanceMinor: number, targetMinor: number): number {
    return Math.min(100, Math.floor((balanceMinor * FULL_SHARE_BPS) / targetMinor / MINOR_PER_MAJOR));
}

function lineOf(goal: OverviewGoal, texts: OverviewTexts, locale: AppLocale): string {
    const balance: string = moneyOf(goal.balanceMinor, locale);
    const target: string = moneyOf(goal.targetMinor, locale);
    return `- ${goal.name}: ${balance} / ${target} (${String(percentOf(goal.balanceMinor, goal.targetMinor))}%). ${texts.status[goal.status]}.`;
}

export function overviewText(goals: readonly OverviewGoal[], locale: AppLocale): string {
    const texts: OverviewTexts = TEXTS[locale];
    if (goals.length === 0) {
        return texts.empty;
    }
    return [texts.header, ...goals.map((goal: OverviewGoal): string => lineOf(goal, texts, locale))].join('\n');
}
