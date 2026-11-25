import { MailContent } from '../../../core/mail/mail.types';
import { baseLayout, textSeal } from '../../../core/mail/templates/base-layout';
import { TemplateProps } from '../../../core/mail/template.registry';
import { AppLocale } from '../../../shared/i18n/locale';

const HTML_ESCAPES: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const HTML_SPECIALS: RegExp = /[&<>"']/g;

export interface NoticeCopy {
    readonly subject: string;
    readonly title: string;
    readonly body: string;
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

export function valueOf(props: TemplateProps, key: string): string {
    return props[key] ?? '';
}

export function noticeContent(copy: NoticeCopy, locale: AppLocale, props: TemplateProps): MailContent {
    const greeting: string = greetingOf(locale, props);
    return {
        subject: copy.subject,
        html: baseLayout({
            locale,
            title: copy.title,
            bodyHtml: `<p>${escapeHtml(greeting)}</p><p>${escapeHtml(copy.body)}</p>`
        }),
        text: `${greeting}\n\n${copy.body}\n\n${textSeal(locale)}`
    };
}
