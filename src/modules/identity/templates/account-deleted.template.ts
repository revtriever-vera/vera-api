import { Injectable, OnModuleInit } from '@nestjs/common';
import { MailContent } from '../../../core/mail/mail.types';
import { baseLayout } from '../../../core/mail/templates/base-layout';
import { TemplateProps, TemplateRegistry } from '../../../core/mail/template.registry';
import { AppLocale } from '../../../shared/i18n/locale';

export const ACCOUNT_DELETED_TEMPLATE: string = 'account-deleted';

const HTML_ESCAPES: Readonly<Record<string, string>> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
};

const HTML_SPECIALS: RegExp = /[&<>"']/g;

function escapeHtml(value: string): string {
    return value.replace(HTML_SPECIALS, (character: string): string => HTML_ESCAPES[character] ?? character);
}

function renderPtBr(props: TemplateProps): MailContent {
    const greeting: string = props['firstName'] ? `Olá, ${props['firstName']}.` : 'Olá.';
    const body: string = 'Sua conta na Vera e todos os dados associados a ela foram excluídos. Esta ação é definitiva.';
    const closing: string = 'Se não foi você quem pediu a exclusão, responda a este e-mail para nos avisar.';
    return {
        subject: 'Sua conta na Vera foi excluída',
        html: baseLayout({
            title: 'Sua conta foi excluída',
            bodyHtml: `<p>${escapeHtml(greeting)}</p><p>${body}</p><p>${closing}</p>`
        }),
        text: `${greeting}\n\n${body}\n\n${closing}`
    };
}

function renderEn(props: TemplateProps): MailContent {
    const greeting: string = props['firstName'] ? `Hi, ${props['firstName']}.` : 'Hi.';
    const body: string = 'Your Vera account and all the data associated with it have been deleted. This cannot be undone.';
    const closing: string = 'If you did not ask for the deletion, reply to this email to let us know.';
    return {
        subject: 'Your Vera account was deleted',
        html: baseLayout({
            locale: 'en',
            title: 'Your account was deleted',
            bodyHtml: `<p>${escapeHtml(greeting)}</p><p>${body}</p><p>${closing}</p>`
        }),
        text: `${greeting}\n\n${body}\n\n${closing}`
    };
}

@Injectable()
export class AccountDeletedTemplate implements OnModuleInit {
    public constructor(private readonly registry: TemplateRegistry) {}

    public onModuleInit(): void {
        const locales: Readonly<Record<AppLocale, (props: TemplateProps) => MailContent>> = { 'pt-BR': renderPtBr, en: renderEn };
        this.registry.register(ACCOUNT_DELETED_TEMPLATE, 'pt-BR', locales['pt-BR']);
        this.registry.register(ACCOUNT_DELETED_TEMPLATE, 'en', locales.en);
    }
}
