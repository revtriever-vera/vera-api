import { Injectable, OnModuleInit } from '@nestjs/common';
import { MailContent } from '../../../core/mail/mail.types';
import { TemplateProps, TemplateRegistry } from '../../../core/mail/template.registry';
import { baseLayout, textFooter } from '../../../core/mail/templates/base-layout';
import { AppLocale } from '../../../shared/i18n/locale';
import { GOALS_PROP, GOALS_URL_PROP } from '../domain/goal-behind-props';
import { GoalBehindCopy, goalBehindCopy } from '../domain/goal-behind-copy';
import { GOAL_BEHIND_TEMPLATE } from '../domain/goal-notice.types';
import { BehindGoalProp, behindGoalsPropSchema } from '../validation/goal-notices.schemas';

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

function goalsOf(props: TemplateProps): BehindGoalProp[] {
    return behindGoalsPropSchema.parse(JSON.parse(props[GOALS_PROP] ?? '[]'));
}

function htmlOf(copy: GoalBehindCopy, greeting: string, locale: AppLocale, props: TemplateProps): string {
    const items: string = copy.lines.map((line: string): string => `<li>${escapeHtml(line)}</li>`).join('');
    return baseLayout({
        locale,
        title: escapeHtml(copy.title),
        bodyHtml: `<p>${escapeHtml(greeting)}</p><p>${escapeHtml(copy.intro)}</p><ul>${items}</ul>`,
        ctaLabel: escapeHtml(copy.ctaLabel),
        ctaUrl: props[GOALS_URL_PROP],
        footnote: escapeHtml(copy.footnote),
        unsubscribeUrl: props['unsubscribeUrl']
    });
}

function textOf(copy: GoalBehindCopy, greeting: string, locale: AppLocale, props: TemplateProps): string {
    const items: string[] = copy.lines.map((line: string): string => `- ${line}`);
    return (
        [greeting, '', copy.intro, ...items, '', `${copy.ctaLabel}: ${props[GOALS_URL_PROP] ?? ''}`, '', copy.footnote].join('\n') +
        textFooter(locale, props['unsubscribeUrl'])
    );
}

function render(locale: AppLocale, props: TemplateProps): MailContent {
    const copy: GoalBehindCopy = goalBehindCopy(goalsOf(props), locale);
    const greeting: string = greetingOf(locale, props);
    return { subject: copy.subject, html: htmlOf(copy, greeting, locale, props), text: textOf(copy, greeting, locale, props) };
}

@Injectable()
export class GoalBehindTemplates implements OnModuleInit {
    public constructor(private readonly registry: TemplateRegistry) {}

    public onModuleInit(): void {
        this.registry.register(GOAL_BEHIND_TEMPLATE, 'pt-BR', (props: TemplateProps): MailContent => render('pt-BR', props));
        this.registry.register(GOAL_BEHIND_TEMPLATE, 'en', (props: TemplateProps): MailContent => render('en', props));
    }
}
