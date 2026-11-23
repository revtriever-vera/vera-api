import { Injectable, OnModuleInit } from '@nestjs/common';
import { MailContent } from '../../../core/mail/mail.types';
import { TemplateProps, TemplateRegistry } from '../../../core/mail/template.registry';
import { noticeContent, valueOf } from './billing-notice';
import { NOTIFICATION_KINDS } from '../domain/billing.types';

export const REFUND_REQUESTED_TEMPLATE: string = 'billing-refund-requested';

function activatedPtBr(props: TemplateProps): MailContent {
    return noticeContent(
        {
            subject: 'Seu Premium está ativo',
            title: 'Premium ativo',
            body: `Recebemos o pagamento e o Premium está ativo até ${valueOf(props, 'paidThrough')}. Você pode acompanhar a próxima cobrança e o histórico em ${valueOf(props, 'url')}.`
        },
        'pt-BR',
        props
    );
}

function activatedEn(props: TemplateProps): MailContent {
    return noticeContent(
        {
            subject: 'Your Premium is active',
            title: 'Premium is active',
            body: `We received your payment and Premium is active until ${valueOf(props, 'paidThrough')}. You can follow the next charge and the history at ${valueOf(props, 'url')}.`
        },
        'en',
        props
    );
}

function pastDuePtBr(props: TemplateProps): MailContent {
    return noticeContent(
        {
            subject: 'Sua cobrança do Premium está em aberto',
            title: 'Cobrança em aberto',
            body: `Não identificamos o pagamento da cobrança do Premium. Você mantém o acesso até ${valueOf(props, 'graceEndsAt')}. Veja a situação na aba Plano e uso: ${valueOf(props, 'url')}.`
        },
        'pt-BR',
        props
    );
}

function pastDueEn(props: TemplateProps): MailContent {
    return noticeContent(
        {
            subject: 'Your Premium charge is open',
            title: 'Open charge',
            body: `We did not find the payment of your Premium charge. You keep access until ${valueOf(props, 'graceEndsAt')}. See the details in Plan and usage: ${valueOf(props, 'url')}.`
        },
        'en',
        props
    );
}

function canceledPtBr(props: TemplateProps): MailContent {
    return noticeContent(
        {
            subject: 'Sua assinatura do Premium foi cancelada',
            title: 'Assinatura cancelada',
            body: `Cancelamos sua assinatura. O Premium continua até ${valueOf(props, 'paidThrough')} e você pode reativar antes disso em ${valueOf(props, 'url')}.`
        },
        'pt-BR',
        props
    );
}

function canceledEn(props: TemplateProps): MailContent {
    return noticeContent(
        {
            subject: 'Your Premium subscription was canceled',
            title: 'Subscription canceled',
            body: `We canceled your subscription. Premium stays on until ${valueOf(props, 'paidThrough')} and you can resume it before that at ${valueOf(props, 'url')}.`
        },
        'en',
        props
    );
}

function endedPtBr(props: TemplateProps): MailContent {
    return noticeContent(
        {
            subject: 'Seu Premium terminou',
            title: 'Premium encerrado',
            body: `O Premium terminou e a conta voltou ao Free. O WhatsApp e o Google Agenda foram desconectados; sua carteira e seus gastos continuam como estão. Para voltar, assine em ${valueOf(props, 'url')}.`
        },
        'pt-BR',
        props
    );
}

function endedEn(props: TemplateProps): MailContent {
    return noticeContent(
        {
            subject: 'Your Premium has ended',
            title: 'Premium ended',
            body: `Premium has ended and the account is back on Free. WhatsApp and Google Calendar were disconnected; your portfolio and spending stay as they are. To come back, subscribe at ${valueOf(props, 'url')}.`
        },
        'en',
        props
    );
}

function refundRequestedContent(props: TemplateProps): MailContent {
    return noticeContent(
        {
            subject: 'Estorno manual pendente',
            title: 'Estorno manual pendente',
            body: `Uma assinatura foi cancelada dentro do prazo de arrependimento. Estorne no painel do gateway conforme o runbook. Assinatura: ${valueOf(props, 'subscriptionId')}; conta: ${valueOf(props, 'companyId')}.`
        },
        'pt-BR',
        props
    );
}

@Injectable()
export class BillingTemplates implements OnModuleInit {
    public constructor(private readonly registry: TemplateRegistry) {}

    public onModuleInit(): void {
        this.registry.register(NOTIFICATION_KINDS.activated, 'pt-BR', activatedPtBr);
        this.registry.register(NOTIFICATION_KINDS.activated, 'en', activatedEn);
        this.registry.register(NOTIFICATION_KINDS.pastDue, 'pt-BR', pastDuePtBr);
        this.registry.register(NOTIFICATION_KINDS.pastDue, 'en', pastDueEn);
        this.registry.register(NOTIFICATION_KINDS.canceled, 'pt-BR', canceledPtBr);
        this.registry.register(NOTIFICATION_KINDS.canceled, 'en', canceledEn);
        this.registry.register(NOTIFICATION_KINDS.ended, 'pt-BR', endedPtBr);
        this.registry.register(NOTIFICATION_KINDS.ended, 'en', endedEn);
        this.registry.register(REFUND_REQUESTED_TEMPLATE, 'pt-BR', refundRequestedContent);
        this.registry.register(REFUND_REQUESTED_TEMPLATE, 'en', refundRequestedContent);
    }
}
