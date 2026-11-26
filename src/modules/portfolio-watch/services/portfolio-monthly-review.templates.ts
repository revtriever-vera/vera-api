import { Injectable, OnModuleInit } from '@nestjs/common';
import { MailContent } from '../../../core/mail/mail.types';
import { TemplateProps, TemplateRegistry } from '../../../core/mail/template.registry';
import { baseLayout, textFooter } from '../../../core/mail/templates/base-layout';
import { AppLocale } from '../../../shared/i18n/locale';
import { MonthlyReviewCopy, monthlyReviewCopy } from '../domain/monthly-review-copy';
import { MONTHLY_REVIEW_TEMPLATE } from '../domain/monthly-review-notice';
import { MONTHLY_REVIEW_PROP } from '../domain/monthly-review-notice.types';
import { monthlyReviewParagraphsPropSchema } from '../validation/monthly-review.schemas';

const HTML_ESCAPES: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const HTML_SPECIALS: RegExp = /[&<>"']/g;
const PERCENT_DIGITS: number = 2;
const MINOR_PER_MAJOR: number = 100;

interface Figure {
    readonly label: string;
    readonly value: string;
}

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

function percentOf(value: string, locale: AppLocale): string {
    const formatter: Intl.NumberFormat = new Intl.NumberFormat(locale, {
        style: 'percent',
        minimumFractionDigits: PERCENT_DIGITS,
        maximumFractionDigits: PERCENT_DIGITS,
        signDisplay: 'exceptZero'
    });
    return formatter.format(Number(value) / MINOR_PER_MAJOR);
}

function moneyOf(minor: string, currency: string, locale: AppLocale): string {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(Number(minor) / MINOR_PER_MAJOR);
}

function optionalFigure(label: string, value: string | undefined, locale: AppLocale): Figure[] {
    return value === undefined ? [] : [{ label, value: percentOf(value, locale) }];
}

function incomeFigure(copy: MonthlyReviewCopy, props: TemplateProps, locale: AppLocale): Figure[] {
    const minor: string | undefined = props[MONTHLY_REVIEW_PROP.incomeMinor];
    const currency: string | undefined = props[MONTHLY_REVIEW_PROP.currency];
    return minor === undefined || currency === undefined || Number(minor) <= 0
        ? []
        : [{ label: copy.incomeLabel, value: moneyOf(minor, currency, locale) }];
}

function figuresOf(copy: MonthlyReviewCopy, props: TemplateProps, locale: AppLocale): Figure[] {
    return [
        ...optionalFigure(copy.returnLabel, props[MONTHLY_REVIEW_PROP.returnPct], locale),
        ...optionalFigure(copy.cdiLabel, props[MONTHLY_REVIEW_PROP.cdiPct], locale),
        ...optionalFigure(copy.ipcaLabel, props[MONTHLY_REVIEW_PROP.ipcaPct], locale),
        ...optionalFigure(copy.ibovespaLabel, props[MONTHLY_REVIEW_PROP.ibovespaPct], locale),
        ...incomeFigure(copy, props, locale)
    ];
}

function paragraphsOf(props: TemplateProps): string[] {
    const raw: string | undefined = props[MONTHLY_REVIEW_PROP.paragraphs];
    return raw === undefined ? [] : monthlyReviewParagraphsPropSchema.parse(JSON.parse(raw));
}

function bodyHtmlOf(copy: MonthlyReviewCopy, figures: readonly Figure[], paragraphs: readonly string[], greeting: string): string {
    const list: string = figures
        .map((item: Figure): string => `<li>${escapeHtml(item.label)}: <strong>${escapeHtml(item.value)}</strong></li>`)
        .join('');
    const unavailable: string = figures.length === 0 ? `<p>${escapeHtml(copy.noReturn)}</p>` : `<ul>${list}</ul>`;
    const text: string = paragraphs.map((paragraph: string): string => `<p>${escapeHtml(paragraph.replaceAll('**', ''))}</p>`).join('');
    return `<p>${escapeHtml(greeting)}</p>${unavailable}${text}`;
}

function textOf(
    copy: MonthlyReviewCopy,
    figures: readonly Figure[],
    paragraphs: readonly string[],
    props: TemplateProps,
    locale: AppLocale
): string {
    const month: string = props[MONTHLY_REVIEW_PROP.month] ?? '';
    const lines: string[] =
        figures.length === 0 ? [copy.noReturn] : figures.map((item: Figure): string => `- ${item.label}: ${item.value}`);
    return (
        [
            greetingOf(locale, props),
            '',
            copy.title(month),
            ...lines,
            ...(paragraphs.length === 0 ? [] : ['', ...paragraphs.map((paragraph: string): string => paragraph.replaceAll('**', ''))]),
            '',
            `${copy.ctaLabel}: ${props[MONTHLY_REVIEW_PROP.reviewUrl] ?? ''}`,
            '',
            copy.footnote
        ].join('\n') + textFooter(locale, props['unsubscribeUrl'])
    );
}

function render(locale: AppLocale, props: TemplateProps): MailContent {
    const copy: MonthlyReviewCopy = monthlyReviewCopy(locale);
    const month: string = props[MONTHLY_REVIEW_PROP.month] ?? '';
    const figures: Figure[] = figuresOf(copy, props, locale);
    const paragraphs: string[] = paragraphsOf(props);
    const reviewUrl: string | undefined = props[MONTHLY_REVIEW_PROP.reviewUrl];
    const html: string = baseLayout({
        locale,
        title: escapeHtml(copy.title(month)),
        bodyHtml: bodyHtmlOf(copy, figures, paragraphs, greetingOf(locale, props)),
        ctaLabel: escapeHtml(copy.ctaLabel),
        ctaUrl: reviewUrl === undefined ? undefined : escapeHtml(reviewUrl),
        footnote: escapeHtml(copy.footnote),
        unsubscribeUrl: props['unsubscribeUrl']
    });
    return { subject: copy.subject(month), html, text: textOf(copy, figures, paragraphs, props, locale) };
}

@Injectable()
export class PortfolioMonthlyReviewTemplates implements OnModuleInit {
    public constructor(private readonly registry: TemplateRegistry) {}

    public onModuleInit(): void {
        this.registry.register(MONTHLY_REVIEW_TEMPLATE, 'pt-BR', (props: TemplateProps): MailContent => render('pt-BR', props));
        this.registry.register(MONTHLY_REVIEW_TEMPLATE, 'en', (props: TemplateProps): MailContent => render('en', props));
    }
}
