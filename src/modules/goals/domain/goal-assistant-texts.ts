import { AppLocale } from '../../../shared/i18n/locale';

const MINOR_PER_MAJOR: number = 100;
const NO_BREAK_SPACE: string = String.fromCodePoint(0xa0);

export function moneyText(minor: number, locale: AppLocale): string {
    const formatter: Intl.NumberFormat = new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: 'BRL',
        minimumFractionDigits: minor % MINOR_PER_MAJOR === 0 ? 0 : 2,
        maximumFractionDigits: 2
    });
    return formatter.format(minor / MINOR_PER_MAJOR).replaceAll(NO_BREAK_SPACE, ' ');
}

export function monthText(date: string, locale: AppLocale): string {
    return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
}

export function lastDayOfMonth(month: string): string {
    const [year, monthNumber] = month.split('-').map(Number);
    return new Date(Date.UTC(year ?? 0, monthNumber ?? 0, 0)).toISOString().slice(0, 10);
}

export function proposalSummary(name: string, targetMinor: number, targetDate: string, locale: AppLocale): string {
    const target: string = moneyText(targetMinor, locale);
    return locale === 'pt-BR'
        ? `Criar o objetivo ${name}: ${target} até ${monthText(targetDate, locale)}.`
        : `Create the goal ${name}: ${target} by ${monthText(targetDate, locale)}.`;
}

export function createdText(name: string, targetMinor: number, targetDate: string, locale: AppLocale): string {
    const target: string = moneyText(targetMinor, locale);
    return locale === 'pt-BR'
        ? `Objetivo criado: ${name}, ${target} até ${monthText(targetDate, locale)}.`
        : `Goal created: ${name}, ${target} by ${monthText(targetDate, locale)}.`;
}
