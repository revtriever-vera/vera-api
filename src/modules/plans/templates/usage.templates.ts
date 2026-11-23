import { Injectable, OnModuleInit } from '@nestjs/common';
import { MailContent } from '../../../core/mail/mail.types';
import { TemplateProps, TemplateRegistry } from '../../../core/mail/template.registry';
import { noticeContent, valueOf } from './plain-notice';

export const USAGE_WARNING_TEMPLATE: string = 'usage-warning';
export const USAGE_PAUSED_TEMPLATE: string = 'usage-paused';

function warningPtBr(props: TemplateProps): MailContent {
    const percent: string = valueOf(props, 'percent');
    return noticeContent(
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
    return noticeContent(
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
    return noticeContent(
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
    return noticeContent(
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
