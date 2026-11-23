import { Injectable, OnModuleInit } from '@nestjs/common';
import { MailContent } from '../../../core/mail/mail.types';
import { TemplateProps, TemplateRegistry } from '../../../core/mail/template.registry';
import { baseLayout } from '../../../core/mail/templates/base-layout';
import { AppLocale } from '../../../shared/i18n/locale';
import { formatMoney } from '../../../shared/utils/format-money';
import { weekdayIndexOf } from '../domain/notice-dates';
import { DueProps, WeekAlert, WeekEntry, WeekProps, dueFromProps, weekFromProps } from '../domain/notice-props';
import { NOTICE_TEMPLATES } from '../domain/recurring-notices.types';

const HTML_ESCAPES: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const HTML_SPECIALS: RegExp = /[&<>"']/g;
const RECURRING_PATH: string = '/spending/recurring';
const SEPARATOR: string = ' · ';

interface Copy {
    readonly greeting: (name: string | undefined) => string;
    readonly weekSubject: (total: string, count: number) => string;
    readonly weekTitle: string;
    readonly lookAt: string;
    readonly cta: string;
    readonly card: string;
    readonly accountLabel: string;
    readonly dueSubject: (name: string, amount: string) => string;
    readonly dueTitle: string;
    readonly dueOn: (card: boolean, account: string) => string;
    readonly lastCharge: (lastDate: string, estimate: boolean) => string;
    readonly weekdays: readonly string[];
    readonly dayMonth: (month: string, day: string) => string;
    readonly priceUp: (name: string, from: string, to: string, percent: number) => string;
    readonly twice: (name: string, first: string, second: string) => string;
    readonly twoAccounts: (name: string) => string;
}

function escapeHtml(value: string): string {
    return value.replace(HTML_SPECIALS, (character: string): string => HTML_ESCAPES[character] ?? character);
}

function withAccount(prefix: string, account: string): string {
    return account === '' ? '' : `${prefix} ${account}.`;
}

function pluralOf(count: number, one: string, many: string): string {
    return count === 1 ? one : many;
}

const PT: Copy = {
    greeting: (name: string | undefined): string => (name ? `Olá, ${name}.` : 'Olá.'),
    weekSubject: (total: string, count: number): string =>
        `Débitos desta semana: ${total} em ${String(count)} ${pluralOf(count, 'cobrança', 'cobranças')}`,
    weekTitle: 'Débitos desta semana',
    lookAt: 'Para olhar',
    cta: 'Ver assinaturas e contas',
    card: 'cartão',
    accountLabel: 'conta',
    dueSubject: (name: string, amount: string): string => `Amanhã: ${name}, ${amount}`,
    dueTitle: 'Débito amanhã',
    dueOn: (card: boolean, account: string): string => withAccount(card ? 'No cartão' : 'Na conta', account),
    lastCharge: (lastDate: string, estimate: boolean): string =>
        estimate ? 'Valor estimado, pela média das últimas cobranças.' : `Valor da última cobrança, em ${lastDate}.`,
    weekdays: ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'],
    dayMonth: (month: string, day: string): string => `${day}/${month}`,
    priceUp: (name: string, from: string, to: string, percent: number): string =>
        `${name} subiu de ${from} para ${to} (+${String(percent)}%)`,
    twice: (name: string, first: string, second: string): string => `${name} cobrou 2 vezes: ${first} e ${second}`,
    twoAccounts: (name: string): string => `Parece a mesma assinatura em duas contas: ${name}`
};

const EN: Copy = {
    greeting: (name: string | undefined): string => (name ? `Hi, ${name}.` : 'Hi.'),
    weekSubject: (total: string, count: number): string =>
        `Debits this week: ${total} in ${String(count)} ${pluralOf(count, 'charge', 'charges')}`,
    weekTitle: 'Debits this week',
    lookAt: 'Worth a look',
    cta: 'See subscriptions and bills',
    card: 'card',
    accountLabel: 'account',
    dueSubject: (name: string, amount: string): string => `Tomorrow: ${name}, ${amount}`,
    dueTitle: 'Debit tomorrow',
    dueOn: (card: boolean, account: string): string => withAccount(card ? 'On the card' : 'On the account', account),
    lastCharge: (lastDate: string, estimate: boolean): string =>
        estimate ? 'Estimated amount, from the average of the last charges.' : `Amount of the last charge, on ${lastDate}.`,
    weekdays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    dayMonth: (month: string, day: string): string => `${month}/${day}`,
    priceUp: (name: string, from: string, to: string, percent: number): string =>
        `${name} went from ${from} to ${to} (+${String(percent)}%)`,
    twice: (name: string, first: string, second: string): string => `${name} charged twice: ${first} and ${second}`,
    twoAccounts: (name: string): string => `This looks like the same subscription on two accounts: ${name}`
};

const COPY: Readonly<Record<AppLocale, Copy>> = { 'pt-BR': PT, en: EN };

function shortDate(date: string, copy: Copy): string {
    return copy.dayMonth(date.slice(5, 7), date.slice(8, 10));
}

function amountText(amountMinor: number, estimate: boolean, locale: AppLocale): string {
    return `${estimate ? '≈ ' : ''}${formatMoney(amountMinor, locale)}`;
}

function entryLine(entry: WeekEntry, copy: Copy, locale: AppLocale): string {
    const weekday: string = copy.weekdays[weekdayIndexOf(entry.date)] ?? '';
    const kind: string = entry.card ? copy.card : copy.accountLabel;
    const where: string = entry.account === '' ? '' : `${SEPARATOR}${kind} ${entry.account}`;
    const amount: string = amountText(entry.amountMinor, entry.estimate, locale);
    return `${weekday} ${shortDate(entry.date, copy)}${SEPARATOR}${entry.name}${SEPARATOR}${amount}${where}`;
}

function numberOf(values: WeekAlert['values'], key: string): number {
    const value: string | number | undefined = values[key];
    return typeof value === 'number' ? value : 0;
}

function dateOf(values: WeekAlert['values'], key: string): string {
    const value: string | number | undefined = values[key];
    return typeof value === 'string' ? value : '';
}

function chargeOf(values: WeekAlert['values'], prefix: string, copy: Copy, locale: AppLocale): string {
    const amount: string = formatMoney(numberOf(values, `${prefix}AmountMinor`), locale);
    const date: string = shortDate(dateOf(values, `${prefix}Date`), copy);
    return `${amount} (${date})`;
}

function alertLine(alert: WeekAlert, copy: Copy, locale: AppLocale): string {
    if (alert.kind === 'price_increase') {
        const from: string = formatMoney(numberOf(alert.values, 'fromAmountMinor'), locale);
        const to: string = formatMoney(numberOf(alert.values, 'toAmountMinor'), locale);
        return copy.priceUp(alert.name, from, to, numberOf(alert.values, 'percent'));
    }
    if (alert.kind === 'duplicate_charge') {
        return copy.twice(alert.name, chargeOf(alert.values, 'first', copy, locale), chargeOf(alert.values, 'second', copy, locale));
    }
    return copy.twoAccounts(alert.name);
}

function listHtml(lines: readonly string[]): string {
    const items: string = lines.map((line: string): string => `<li>${escapeHtml(line)}</li>`).join('');
    return `<ul style="padding-left:18px;margin:12px 0">${items}</ul>`;
}

function bulletsOf(lines: readonly string[]): string {
    return lines.map((line: string): string => `- ${line}`).join('\n');
}

function appUrlOf(props: TemplateProps): string {
    return `${props['appUrl'] ?? ''}${RECURRING_PATH}`;
}

function weekContent(locale: AppLocale, props: TemplateProps): MailContent {
    const copy: Copy = COPY[locale];
    const week: WeekProps = weekFromProps(props);
    const lines: string[] = week.entries.map((entry: WeekEntry): string => entryLine(entry, copy, locale));
    const looks: string[] = week.alerts.map((alert: WeekAlert): string => alertLine(alert, copy, locale));
    const greeting: string = copy.greeting(props['firstName']);
    const lookHtml: string = looks.length === 0 ? '' : `<p><strong>${copy.lookAt}</strong></p>${listHtml(looks)}`;
    const lookText: string = looks.length === 0 ? '' : `\n\n${copy.lookAt}\n${bulletsOf(looks)}`;
    return {
        subject: copy.weekSubject(formatMoney(week.totalMinor, locale), week.entries.length),
        html: baseLayout({
            locale,
            title: copy.weekTitle,
            bodyHtml: `<p>${escapeHtml(greeting)}</p>${listHtml(lines)}${lookHtml}`,
            ctaLabel: copy.cta,
            ctaUrl: appUrlOf(props),
            unsubscribeUrl: props['unsubscribeUrl']
        }),
        text: `${greeting}\n\n${bulletsOf(lines)}${lookText}\n\n${copy.cta}: ${appUrlOf(props)}`
    };
}

function dueContent(locale: AppLocale, props: TemplateProps): MailContent {
    const copy: Copy = COPY[locale];
    const due: DueProps = dueFromProps(props);
    const greeting: string = copy.greeting(props['firstName']);
    const body: string = [copy.dueOn(due.card, due.account), copy.lastCharge(shortDate(due.lastDate, copy), due.estimate)]
        .filter((part: string): boolean => part !== '')
        .join(' ');
    const amount: string = amountText(due.amountMinor, due.estimate, locale);
    const headline: string = `<p><strong>${escapeHtml(due.name)}</strong>${SEPARATOR}${escapeHtml(amount)}</p>`;
    return {
        subject: copy.dueSubject(due.name, amount),
        html: baseLayout({
            locale,
            title: copy.dueTitle,
            bodyHtml: `<p>${escapeHtml(greeting)}</p>${headline}<p>${escapeHtml(body)}</p>`,
            ctaLabel: copy.cta,
            ctaUrl: appUrlOf(props),
            unsubscribeUrl: props['unsubscribeUrl']
        }),
        text: `${greeting}\n\n${due.name}${SEPARATOR}${amount}\n${body}\n\n${copy.cta}: ${appUrlOf(props)}`
    };
}

@Injectable()
export class RecurringNoticeTemplates implements OnModuleInit {
    public constructor(private readonly registry: TemplateRegistry) {}

    public onModuleInit(): void {
        this.registry.register(NOTICE_TEMPLATES.week, 'pt-BR', (props: TemplateProps): MailContent => weekContent('pt-BR', props));
        this.registry.register(NOTICE_TEMPLATES.week, 'en', (props: TemplateProps): MailContent => weekContent('en', props));
        this.registry.register(NOTICE_TEMPLATES.due, 'pt-BR', (props: TemplateProps): MailContent => dueContent('pt-BR', props));
        this.registry.register(NOTICE_TEMPLATES.due, 'en', (props: TemplateProps): MailContent => dueContent('en', props));
    }
}
