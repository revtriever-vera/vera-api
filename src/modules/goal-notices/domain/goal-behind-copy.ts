import { AppLocale } from '../../../shared/i18n/locale';
import { BehindGoalProp } from '../validation/goal-notices.schemas';

const MINOR_PER_MAJOR: number = 100;
const NO_BREAK_SPACE: string = String.fromCodePoint(0xa0);

export interface GoalBehindCopy {
    readonly subject: string;
    readonly title: string;
    readonly intro: string;
    readonly lines: readonly string[];
    readonly ctaLabel: string;
    readonly footnote: string;
}

interface LocaleTexts {
    readonly subjectOne: (goal: BehindGoalProp, remaining: string) => string;
    readonly subjectMany: (count: number) => string;
    readonly title: string;
    readonly intro: string;
    readonly line: (goal: BehindGoalProp, money: (minor: number) => string, month: string) => string;
    readonly ctaLabel: string;
    readonly footnote: string;
}

const TEXTS: Readonly<Record<AppLocale, LocaleTexts>> = {
    'pt-BR': {
        subjectOne: (goal: BehindGoalProp, remaining: string): string => `Objetivo atrasado: ${goal.name}. Faltam ${remaining}`,
        subjectMany: (count: number): string => `${String(count)} objetivos atrasados`,
        title: 'Seus objetivos pedem atenção',
        intro: 'A Vera conferiu os seus objetivos e estes estão atrasados:',
        line: (goal: BehindGoalProp, money: (minor: number) => string, month: string): string =>
            goal.overdue
                ? `${goal.name}: a data (${month}) passou e faltam ${money(goal.remainingMinor)} para chegar a ${money(goal.targetMinor)}.`
                : `${goal.name}: para chegar a ${money(goal.targetMinor)} em ${month}, são ${money(goal.monthlyMinor)} por mês. Eram ${money(goal.planMonthlyMinor)}.`,
        ctaLabel: 'Ver objetivos',
        footnote: 'A conta não inclui rendimento futuro.'
    },
    en: {
        subjectOne: (goal: BehindGoalProp, remaining: string): string => `Goal behind: ${goal.name}. ${remaining} to go`,
        subjectMany: (count: number): string => `${String(count)} goals behind`,
        title: 'Your goals need attention',
        intro: 'Vera checked your goals and these are behind:',
        line: (goal: BehindGoalProp, money: (minor: number) => string, month: string): string =>
            goal.overdue
                ? `${goal.name}: the date (${month}) has passed and ${money(goal.remainingMinor)} is still missing to reach ${money(goal.targetMinor)}.`
                : `${goal.name}: to reach ${money(goal.targetMinor)} by ${month}, it takes ${money(goal.monthlyMinor)} a month. It was ${money(goal.planMonthlyMinor)}.`,
        ctaLabel: 'See goals',
        footnote: 'The math does not include future yield.'
    }
};

function moneyFormatter(locale: AppLocale): (minor: number) => string {
    const formatter: Intl.NumberFormat = new Intl.NumberFormat(locale, { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
    return (minor: number): string => formatter.format(Math.round(minor / MINOR_PER_MAJOR)).replaceAll(NO_BREAK_SPACE, ' ');
}

function monthLabel(isoDate: string, locale: AppLocale): string {
    return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${isoDate}T00:00:00Z`));
}

export function goalBehindCopy(goals: readonly BehindGoalProp[], locale: AppLocale): GoalBehindCopy {
    const texts: LocaleTexts = TEXTS[locale];
    const money: (minor: number) => string = moneyFormatter(locale);
    const [first]: readonly BehindGoalProp[] = goals;
    const subject: string =
        goals.length === 1 && first !== undefined ? texts.subjectOne(first, money(first.remainingMinor)) : texts.subjectMany(goals.length);
    return {
        subject,
        title: texts.title,
        intro: texts.intro,
        lines: goals.map((goal: BehindGoalProp): string => texts.line(goal, money, monthLabel(goal.targetDate, locale))),
        ctaLabel: texts.ctaLabel,
        footnote: texts.footnote
    };
}
