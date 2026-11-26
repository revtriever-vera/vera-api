import { Injectable, OnModuleInit } from '@nestjs/common';
import { MailContent } from '../../../core/mail/mail.types';
import { baseLayout, textSeal } from '../../../core/mail/templates/base-layout';
import { TemplateProps, TemplateRegistry } from '../../../core/mail/template.registry';
import { AppLocale } from '../../../shared/i18n/locale';
import { escapeHtml } from './escape-html.util';

export const ADMIN_TOTP_ACTIVATED_TEMPLATE: string = 'admin-totp-activated';
export const ADMIN_RECOVERY_CODE_USED_TEMPLATE: string = 'admin-recovery-code-used';

type Renderer = (props: TemplateProps) => MailContent;

interface Copy {
    readonly title: string;
    readonly lines: readonly string[];
}

const COPIES: Readonly<Record<string, Readonly<Record<AppLocale, Copy>>>> = {
    [ADMIN_TOTP_ACTIVATED_TEMPLATE]: {
        'pt-BR': {
            title: 'Autenticador ativado no admin da Vera',
            lines: [
                'O segundo fator foi ativado no seu acesso ao admin da Vera. A partir de agora, o login pede o código do app autenticador.',
                'Se não foi você, avise quem administra a plataforma agora.'
            ]
        },
        en: {
            title: 'Authenticator turned on for the Vera admin',
            lines: [
                'The second factor was turned on for your Vera admin access. From now on, signing in asks for the code of the authenticator app.',
                'If this was not you, tell whoever runs the platform right away.'
            ]
        }
    },
    [ADMIN_RECOVERY_CODE_USED_TEMPLATE]: {
        'pt-BR': {
            title: 'Código de recuperação usado no admin da Vera',
            lines: [
                'Um código de recuperação foi usado para entrar no admin da Vera. Cada código vale uma vez só.',
                'Se não foi você, avise quem administra a plataforma agora: o autenticador pode ser zerado pelo seed.'
            ]
        },
        en: {
            title: 'Recovery code used on the Vera admin',
            lines: [
                'A recovery code was used to sign in to the Vera admin. Each code works once.',
                'If this was not you, tell whoever runs the platform right away: the authenticator can be reset through the seed.'
            ]
        }
    }
};

function render(name: string, locale: AppLocale): Renderer {
    const copy: Copy | undefined = COPIES[name]?.[locale];
    return (): MailContent => {
        const lines: readonly string[] = copy?.lines ?? [];
        return {
            subject: copy?.title ?? name,
            html: baseLayout({
                locale,
                title: copy?.title ?? name,
                bodyHtml: lines.map((line: string): string => `<p>${escapeHtml(line)}</p>`).join('')
            }),
            text: `${lines.join('\n\n')}\n\n${textSeal(locale)}`
        };
    };
}

@Injectable()
export class AdminSecurityTemplates implements OnModuleInit {
    public constructor(private readonly registry: TemplateRegistry) {}

    public onModuleInit(): void {
        for (const name of Object.keys(COPIES)) {
            this.registry.register(name, 'pt-BR', render(name, 'pt-BR'));
            this.registry.register(name, 'en', render(name, 'en'));
        }
    }
}
