import { Injectable, OnModuleInit } from '@nestjs/common';
import { MailContent } from '../../../core/mail/mail.types';
import { baseLayout } from '../../../core/mail/templates/base-layout';
import { TemplateProps, TemplateRegistry } from '../../../core/mail/template.registry';
import { AppLocale } from '../../../shared/i18n/locale';
import { escapeHtml } from './escape-html.util';

export const MEMBER_INVITED_TEMPLATE: string = 'member-invited';
export const MEMBER_REMOVED_TEMPLATE: string = 'member-removed';
export const MEMBER_LEFT_TEMPLATE: string = 'member-left';
export const ACCOUNT_DELETED_MEMBER_TEMPLATE: string = 'account-deleted-member';

type Renderer = (props: TemplateProps) => MailContent;

const ROLE_LABELS: Readonly<Record<AppLocale, Readonly<Record<string, string>>>> = {
    'pt-BR': { owner: 'Dono', editor: 'Editor', viewer: 'Leitura' },
    en: { owner: 'Owner', editor: 'Editor', viewer: 'Viewer' }
};

function prop(props: TemplateProps, key: string): string {
    return props[key] ?? '';
}

function paragraphs(lines: readonly string[]): string {
    return lines.map((line: string): string => `<p>${escapeHtml(line)}</p>`).join('');
}

function plain(lines: readonly string[]): string {
    return lines.join('\n\n');
}

function invitedPtBr(props: TemplateProps): MailContent {
    const role: string = ROLE_LABELS['pt-BR'][prop(props, 'role')] ?? prop(props, 'role');
    const lines: string[] = [
        `${prop(props, 'inviterName')} te convidou para a conta dele na Vera, com o papel ${role}.`,
        `Abra o link e entre com a conta do Google neste e-mail. Não precisa criar senha. O link vale ${prop(props, 'days')} dias.`
    ];
    return {
        subject: `${prop(props, 'inviterName')} te convidou para a conta dele na Vera`,
        html: baseLayout({
            title: 'Convite para a conta na Vera',
            bodyHtml: paragraphs(lines),
            ctaLabel: 'Aceitar o convite',
            ctaUrl: escapeHtml(prop(props, 'link'))
        }),
        text: `${plain(lines)}\n\n${prop(props, 'link')}`
    };
}

function invitedEn(props: TemplateProps): MailContent {
    const role: string = ROLE_LABELS.en[prop(props, 'role')] ?? prop(props, 'role');
    const lines: string[] = [
        `${prop(props, 'inviterName')} invited you to their account on Vera, with the ${role} role.`,
        `Open the link and sign in with the Google account for this e-mail. No password to create. The link is valid for ${prop(props, 'days')} days.`
    ];
    return {
        subject: `${prop(props, 'inviterName')} invited you to their account on Vera`,
        html: baseLayout({
            locale: 'en',
            title: 'Invitation to an account on Vera',
            bodyHtml: paragraphs(lines),
            ctaLabel: 'Accept the invitation',
            ctaUrl: escapeHtml(prop(props, 'link'))
        }),
        text: `${plain(lines)}\n\n${prop(props, 'link')}`
    };
}

function simple(locale: AppLocale, title: string, subject: string, lines: readonly string[]): MailContent {
    return {
        subject,
        html: baseLayout({ locale, title, bodyHtml: paragraphs(lines) }),
        text: plain(lines)
    };
}

function removedPtBr(props: TemplateProps): MailContent {
    const subject: string = `Você não tem mais acesso à conta de ${prop(props, 'accountName')} na Vera`;
    return simple('pt-BR', 'Seu acesso foi removido', subject, [
        `Olá, ${prop(props, 'firstName')}.`,
        `${subject}. Para voltar, alguém da conta precisa te convidar de novo.`
    ]);
}

function removedEn(props: TemplateProps): MailContent {
    const subject: string = `You no longer have access to ${prop(props, 'accountName')}'s account on Vera`;
    return simple('en', 'Your access was removed', subject, [
        `Hi, ${prop(props, 'firstName')}.`,
        `${subject}. To come back, someone in the account needs to invite you again.`
    ]);
}

function leftPtBr(props: TemplateProps): MailContent {
    const subject: string = `Você saiu da conta de ${prop(props, 'accountName')} na Vera`;
    return simple('pt-BR', 'Você saiu da conta', subject, [
        `Olá, ${prop(props, 'firstName')}.`,
        `${subject}. Você perdeu o acesso a esta carteira e a estes gastos. Para voltar, alguém da conta precisa te convidar de novo.`
    ]);
}

function leftEn(props: TemplateProps): MailContent {
    const subject: string = `You left ${prop(props, 'accountName')}'s account on Vera`;
    return simple('en', 'You left the account', subject, [
        `Hi, ${prop(props, 'firstName')}.`,
        `${subject}. You no longer have access to this portfolio and these expenses. To come back, someone in the account needs to invite you again.`
    ]);
}

function accountDeletedPtBr(props: TemplateProps): MailContent {
    const subject: string = `A conta de ${prop(props, 'accountName')} na Vera foi excluída`;
    return simple('pt-BR', 'A conta foi excluída', subject, [
        `Olá, ${prop(props, 'firstName')}.`,
        `${subject}. Os dados dela foram apagados de forma definitiva e você não tem mais acesso a ela.`
    ]);
}

function accountDeletedEn(props: TemplateProps): MailContent {
    const subject: string = `${prop(props, 'accountName')}'s account on Vera was deleted`;
    return simple('en', 'The account was deleted', subject, [
        `Hi, ${prop(props, 'firstName')}.`,
        `${subject}. Its data was permanently erased and you no longer have access to it.`
    ]);
}

const RENDERERS: Readonly<Record<string, Readonly<Record<AppLocale, Renderer>>>> = {
    [MEMBER_INVITED_TEMPLATE]: { 'pt-BR': invitedPtBr, en: invitedEn },
    [MEMBER_REMOVED_TEMPLATE]: { 'pt-BR': removedPtBr, en: removedEn },
    [MEMBER_LEFT_TEMPLATE]: { 'pt-BR': leftPtBr, en: leftEn },
    [ACCOUNT_DELETED_MEMBER_TEMPLATE]: { 'pt-BR': accountDeletedPtBr, en: accountDeletedEn }
};

@Injectable()
export class MemberTemplates implements OnModuleInit {
    public constructor(private readonly registry: TemplateRegistry) {}

    public onModuleInit(): void {
        for (const [name, locales] of Object.entries(RENDERERS)) {
            this.registry.register(name, 'pt-BR', locales['pt-BR']);
            this.registry.register(name, 'en', locales.en);
        }
    }
}
