import { Injectable, OnModuleInit } from '@nestjs/common';
import { MailContent } from '../../../core/mail/mail.types';
import { baseLayout } from '../../../core/mail/templates/base-layout';
import { TemplateProps, TemplateRegistry } from '../../../core/mail/template.registry';
import { AppLocale } from '../../../shared/i18n/locale';

export const USAGE_WARNING_TEMPLATE: string = 'usage-warning';
export const USAGE_PAUSED_TEMPLATE: string = 'usage-paused';

const HTML_ESCAPES: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const HTML_SPECIALS: RegExp = /[&<>"']/g;

function escapeHtml(value: string): string {
    return value.replace(HTML_SPECIALS, (character: string): string => HTML_ESCAPES[character] ?? character);
}

interface Copy {
    readonly subject: string;
    readonly title: string;
    readonly body: string;
}

function valueOf(props: TemplateProps, key: string): string {
    return props[key] ?? '';
}

function greetingOf(locale: AppLocale, props: TemplateProps): string {
    const name: string | undefined = props['firstName'];
    if (locale === 'en') {
        return name ? `Hi, ${name}.` : 'Hi.';
    }
    return name ? `Olá, ${name}.` : 'Olá.';
}

function contentOf(copy: Copy, locale: AppLocale, props: TemplateProps): MailContent {
    const greeting: string = greetingOf(locale, props);
    return {
        subject: copy.subject,
        html: baseLayout({
            locale,
            title: copy.title,
            bodyHtml: `<p>${escapeHtml(greeting)}</p><p>${escapeHtml(copy.body)}</p>`
        }),
        text: `${greeting}\n\n${copy.body}`
    };
}

function warningPtBr(props: TemplateProps): MailContent {
    const percent: string = valueOf(props, 'percent');
    return contentOf(
        {
            subject: `Você usou ${percent}% da cota de ${valueOf(props, 'month')}`,
            title: 'Sua cota está acabando',
            body: `${percent}% da cota de ${valueOf(props, 'month')} usada. Em 100%, explicações e WhatsApp pausam até 1º de ${valueOf(props, 'resetMonth')}, sem cobrança extra.`
        },
        'pt-BR',
        props
    );
}

function warningEn(props: TemplateProps): MailContent {
    const percent: string = valueOf(props, 'percent');
    return contentOf(
        {
            subject: `You used ${percent}% of your ${valueOf(props, 'month')} quota`,
            title: 'Your quota is running low',
            body: `${percent}% of your ${valueOf(props, 'month')} quota is used. At 100%, explanations and WhatsApp pause until ${valueOf(props, 'resetMonth')} 1, at no extra charge.`
        },
        'en',
        props
    );
}

function pausedPtBr(props: TemplateProps): MailContent {
    return contentOf(
        {
            subject: `A cota de ${valueOf(props, 'month')} acabou`,
            title: 'Explicações e WhatsApp pausados',
            body: `A cota de ${valueOf(props, 'month')} chegou a 100%. Explicações e WhatsApp ficam pausados até 1º de ${valueOf(props, 'resetMonth')}, sem cobrança extra.`
        },
        'pt-BR',
        props
    );
}

function pausedEn(props: TemplateProps): MailContent {
    return contentOf(
        {
            subject: `Your ${valueOf(props, 'month')} quota is used up`,
            title: 'Explanations and WhatsApp paused',
            body: `Your ${valueOf(props, 'month')} quota reached 100%. Explanations and WhatsApp stay paused until ${valueOf(props, 'resetMonth')} 1, at no extra charge.`
        },
        'en',
        props
    );
}

@Injectable()
export class UsageTemplates implements OnModuleInit {
    public constructor(private readonly registry: TemplateRegistry) {}

    public onModuleInit(): void {
        this.registry.register(USAGE_WARNING_TEMPLATE, 'pt-BR', warningPtBr);
        this.registry.register(USAGE_WARNING_TEMPLATE, 'en', warningEn);
        this.registry.register(USAGE_PAUSED_TEMPLATE, 'pt-BR', pausedPtBr);
        this.registry.register(USAGE_PAUSED_TEMPLATE, 'en', pausedEn);
    }
}
