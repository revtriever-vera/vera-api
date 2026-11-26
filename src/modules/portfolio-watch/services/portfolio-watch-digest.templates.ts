import { Injectable, OnModuleInit } from '@nestjs/common';
import { MailContent } from '../../../core/mail/mail.types';
import { TemplateProps, TemplateRegistry } from '../../../core/mail/template.registry';
import { baseLayout, textFooter } from '../../../core/mail/templates/base-layout';
import { AppLocale } from '../../../shared/i18n/locale';
import { DIGEST_ENTRIES_PROP, DIGEST_UNSUBSCRIBE_PROP } from '../../notices/services/notice.service';
import { WATCH_DIGEST_TEMPLATE } from '../domain/portfolio-agenda.types';
import { WatchDigestCopy, WatchDigestLine, watchDigestCopy } from '../domain/watch-digest-copy';
import { WatchDigestEntry, watchDigestEntriesSchema, watchDigestUnsubscribeSchema } from '../validation/portfolio-watch.schemas';

const HTML_ESCAPES: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const HTML_SPECIALS: RegExp = /[&<>"']/g;
const DOCUMENT_LABEL: Readonly<Record<AppLocale, string>> = { 'pt-BR': 'Documento', en: 'Document' };
const STOP_LABEL: Readonly<Record<AppLocale, string>> = { 'pt-BR': 'Parar de receber', en: 'Stop receiving' };

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

function entriesOf(props: TemplateProps): WatchDigestEntry[] {
    return watchDigestEntriesSchema.parse(JSON.parse(props[DIGEST_ENTRIES_PROP] ?? '[]'));
}

function stopLinksOf(
    entries: readonly WatchDigestEntry[],
    copy: WatchDigestCopy,
    locale: AppLocale,
    props: TemplateProps
): [string, string][] {
    const urls: Record<string, string> = watchDigestUnsubscribeSchema.parse(JSON.parse(props[DIGEST_UNSUBSCRIBE_PROP] ?? '{}'));
    const types: string[] = [...new Set(entries.map((entry: WatchDigestEntry): string => entry.type))];
    return types.flatMap((type: string): [string, string][] => {
        const url: string | undefined = urls[type];
        return url === undefined ? [] : [[`${STOP_LABEL[locale]}: ${copy.unsubscribeLabels[type] ?? type}`, url]];
    });
}

function documentLinkOf(line: WatchDigestLine, locale: AppLocale): string {
    return line.documentUrl === null ? '' : ` <a href="${escapeHtml(line.documentUrl)}">${DOCUMENT_LABEL[locale]}</a>`;
}

function htmlOf(copy: WatchDigestCopy, stops: readonly [string, string][], locale: AppLocale, props: TemplateProps): string {
    const items: string = copy.lines
        .map((line: WatchDigestLine): string => `<li>${escapeHtml(line.text)}${documentLinkOf(line, locale)}</li>`)
        .join('');
    const links: string = stops
        .map(([label, url]: [string, string]): string => `<a href="${escapeHtml(url)}">${escapeHtml(label)}</a>`)
        .join('<br>');
    return baseLayout({
        locale,
        title: escapeHtml(copy.title),
        bodyHtml: `<p>${escapeHtml(greetingOf(locale, props))}</p><p>${escapeHtml(copy.intro)}</p><ul>${items}</ul><p style="font-size:13px">${links}</p>`,
        footnote: escapeHtml(copy.footnote),
        unsubscribeUrl: props['unsubscribeUrl']
    });
}

function textOf(copy: WatchDigestCopy, stops: readonly [string, string][], locale: AppLocale, props: TemplateProps): string {
    const items: string[] = copy.lines.map((line: WatchDigestLine): string => [`- ${line.text}`, line.documentUrl ?? ''].join(' ').trim());
    const links: string[] = stops.map(([label, url]: [string, string]): string => `${label}: ${url}`);
    return (
        [greetingOf(locale, props), '', copy.intro, ...items, '', copy.footnote, '', ...links].join('\n') +
        textFooter(locale, props['unsubscribeUrl'])
    );
}

function render(locale: AppLocale, props: TemplateProps): MailContent {
    const entries: WatchDigestEntry[] = entriesOf(props);
    const copy: WatchDigestCopy = watchDigestCopy(entries, locale);
    const stops: [string, string][] = stopLinksOf(entries, copy, locale, props);
    return { subject: copy.subject, html: htmlOf(copy, stops, locale, props), text: textOf(copy, stops, locale, props) };
}

@Injectable()
export class PortfolioWatchDigestTemplates implements OnModuleInit {
    public constructor(private readonly registry: TemplateRegistry) {}

    public onModuleInit(): void {
        this.registry.register(WATCH_DIGEST_TEMPLATE, 'pt-BR', (props: TemplateProps): MailContent => render('pt-BR', props));
        this.registry.register(WATCH_DIGEST_TEMPLATE, 'en', (props: TemplateProps): MailContent => render('en', props));
    }
}
