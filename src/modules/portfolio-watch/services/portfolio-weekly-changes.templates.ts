import { Injectable, OnModuleInit } from '@nestjs/common';
import { MailContent } from '../../../core/mail/mail.types';
import { TemplateProps, TemplateRegistry } from '../../../core/mail/template.registry';
import { baseLayout, textFooter } from '../../../core/mail/templates/base-layout';
import { AppLocale } from '../../../shared/i18n/locale';
import { WeeklyChangesCopy, weeklyChangesCopy } from '../domain/weekly-changes-copy';
import { WEEKLY_CHANGES_TEMPLATE, WEEKLY_ITEMS_PROP, WEEKLY_PORTFOLIO_URL_PROP } from '../domain/weekly-changes';
import { WeeklyChangeProp, weeklyChangesPropSchema } from '../validation/portfolio-watch.schemas';

const HTML_ESCAPES: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const HTML_SPECIALS: RegExp = /[&<>"']/g;

function escapeHtml(value: string): string {
    return value.replace(HTML_SPECIALS, (character: string): string => HTML_ESCAPES[character] ?? character);
}

function greetingOf(locale: AppLocale, props: TemplateProps): string {
    const name: string | undefined = props['firstName'];
    if (locale === 'en') {
        return name ? `Hi, ${name}.` : 'Hi.';
    }
    return name ? `Olá, ${name}.` : 'Olá.';
}

function itemsOf(props: TemplateProps): WeeklyChangeProp[] {
    return weeklyChangesPropSchema.parse(JSON.parse(props[WEEKLY_ITEMS_PROP] ?? '[]'));
}

function itemHtmlOf(item: WeeklyChangeProp, copy: WeeklyChangesCopy): string {
    const link: string = `<a href="${escapeHtml(item.documentUrl)}">${copy.documentLabel}</a>`;
    return `<li><strong>${escapeHtml(item.symbol)}</strong>: ${escapeHtml(item.summary)} ${link}</li>`;
}

function htmlOf(items: readonly WeeklyChangeProp[], copy: WeeklyChangesCopy, locale: AppLocale, props: TemplateProps): string {
    const portfolioUrl: string | undefined = props[WEEKLY_PORTFOLIO_URL_PROP];
    return baseLayout({
        locale,
        title: escapeHtml(copy.title),
        bodyHtml: `<p>${escapeHtml(greetingOf(locale, props))}</p><ul>${items.map((item: WeeklyChangeProp): string => itemHtmlOf(item, copy)).join('')}</ul>`,
        ctaLabel: escapeHtml(copy.ctaLabel),
        ctaUrl: portfolioUrl === undefined ? undefined : escapeHtml(portfolioUrl),
        footnote: escapeHtml(copy.footnote),
        unsubscribeUrl: props['unsubscribeUrl']
    });
}

function textOf(items: readonly WeeklyChangeProp[], copy: WeeklyChangesCopy, locale: AppLocale, props: TemplateProps): string {
    const lines: string[] = items.map((item: WeeklyChangeProp): string => `- ${item.symbol}: ${item.summary} ${item.documentUrl}`);
    return (
        [
            greetingOf(locale, props),
            '',
            copy.title,
            ...lines,
            '',
            `${copy.ctaLabel}: ${props[WEEKLY_PORTFOLIO_URL_PROP] ?? ''}`,
            '',
            copy.footnote
        ].join('\n') + textFooter(locale, props['unsubscribeUrl'])
    );
}

function render(locale: AppLocale, props: TemplateProps): MailContent {
    const copy: WeeklyChangesCopy = weeklyChangesCopy(locale);
    const items: WeeklyChangeProp[] = itemsOf(props);
    return { subject: copy.subject, html: htmlOf(items, copy, locale, props), text: textOf(items, copy, locale, props) };
}

@Injectable()
export class PortfolioWeeklyChangesTemplates implements OnModuleInit {
    public constructor(private readonly registry: TemplateRegistry) {}

    public onModuleInit(): void {
        this.registry.register(WEEKLY_CHANGES_TEMPLATE, 'pt-BR', (props: TemplateProps): MailContent => render('pt-BR', props));
        this.registry.register(WEEKLY_CHANGES_TEMPLATE, 'en', (props: TemplateProps): MailContent => render('en', props));
    }
}
