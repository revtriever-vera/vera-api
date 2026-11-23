import { AppLocale } from '../../../shared/i18n/locale';
import { formatMoney } from '../../../shared/utils/format-money';
import { dayNumber } from './recurring-dates';

const WEEKDAYS: Readonly<Record<AppLocale, readonly string[]>> = {
    'pt-BR': ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'],
    en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
};
const SUNDAY: number = 0;
const SATURDAY: number = 6;
const DAYS_IN_WEEK: number = 7;
const EPOCH_WEEKDAY: number = 4;

export interface WeekDebit {
    readonly name: string;
    readonly date: string;
    readonly amountMinor: number;
    readonly isEstimate: boolean;
}

export interface SubscriptionFigures {
    readonly monthlyMinor: number;
    readonly yearlyMinor: number;
    readonly count: number;
}

export function weekdayIndexOf(date: string): number {
    return (dayNumber(date) + EPOCH_WEEKDAY) % DAYS_IN_WEEK;
}

export function daysUntilSunday(today: string): number {
    return (DAYS_IN_WEEK - weekdayIndexOf(today)) % DAYS_IN_WEEK;
}

function weekdayName(date: string, locale: AppLocale): string {
    return WEEKDAYS[locale][weekdayIndexOf(date)] ?? '';
}

function biggestOf(debits: readonly WeekDebit[]): WeekDebit {
    return debits.reduce((largest: WeekDebit, debit: WeekDebit): WeekDebit => (debit.amountMinor > largest.amountMinor ? debit : largest));
}

function approximateOf(debits: readonly WeekDebit[], locale: AppLocale): string {
    if (!debits.some((debit: WeekDebit): boolean => debit.isEstimate)) {
        return '';
    }
    return locale === 'pt-BR' ? ' Alguns valores são estimados.' : ' Some amounts are estimates.';
}

function dayPhrase(date: string, locale: AppLocale): string {
    const name: string = weekdayName(date, locale);
    if (locale === 'en') {
        return `on ${name}`;
    }
    return weekdayIndexOf(date) === SUNDAY || weekdayIndexOf(date) === SATURDAY ? `no ${name}` : `na ${name}`;
}

export function weekText(debits: readonly WeekDebit[], locale: AppLocale): string {
    const sunday: string = WEEKDAYS[locale][SUNDAY] ?? '';
    if (debits.length === 0) {
        return locale === 'pt-BR' ? `Você não tem débitos recorrentes até ${sunday}.` : `You have no recurring debits until ${sunday}.`;
    }
    const total: number = debits.reduce((sum: number, debit: WeekDebit): number => sum + debit.amountMinor, 0);
    const biggest: WeekDebit = biggestOf(debits);
    const amount: string = formatMoney(biggest.amountMinor, locale);
    if (locale === 'pt-BR') {
        const noun: string = debits.length === 1 ? 'débito' : 'débitos';
        return `${formatMoney(total, locale)} em ${String(debits.length)} ${noun} até ${sunday}. O maior é ${biggest.name}, ${amount}, ${dayPhrase(biggest.date, locale)}.${approximateOf(debits, locale)}`;
    }
    const noun: string = debits.length === 1 ? 'debit' : 'debits';
    return `${formatMoney(total, locale)} in ${String(debits.length)} ${noun} until ${sunday}. The biggest is ${biggest.name}, ${amount}, ${dayPhrase(biggest.date, locale)}.${approximateOf(debits, locale)}`;
}

export function subscriptionsText(figures: SubscriptionFigures, locale: AppLocale): string {
    if (figures.count === 0) {
        return locale === 'pt-BR' ? 'Você ainda não confirmou nenhuma assinatura.' : 'You have not confirmed any subscription yet.';
    }
    const monthly: string = formatMoney(figures.monthlyMinor, locale);
    const yearly: string = formatMoney(figures.yearlyMinor, locale);
    if (locale === 'pt-BR') {
        const noun: string = figures.count === 1 ? 'assinatura' : 'assinaturas';
        return `${monthly} por mês em ${String(figures.count)} ${noun}, ${yearly} por ano.`;
    }
    const noun: string = figures.count === 1 ? 'subscription' : 'subscriptions';
    return `${monthly} per month in ${String(figures.count)} ${noun}, ${yearly} per year.`;
}
