import { Injectable, OnModuleInit } from '@nestjs/common';
import { MailContent } from '../../../core/mail/mail.types';
import { TemplateProps, TemplateRegistry } from '../../../core/mail/template.registry';
import { noticeContent, valueOf } from './plain-notice';

export const TRIAL_ENDING_TEMPLATE: string = 'trial-ending';
export const TRIAL_ENDED_TEMPLATE: string = 'trial-ended';

function endingPtBr(props: TemplateProps): MailContent {
    const endsAt: string = valueOf(props, 'endsAt');
    return noticeContent(
        {
            subject: `Seu teste do Premium acaba em ${endsAt}`,
            title: 'Seu teste está acabando',
            body: `O teste do Premium termina em ${endsAt}. Depois disso a conta volta ao Free, e o WhatsApp e o Google Agenda são desconectados. Sua carteira e seus gastos continuam como estão. Para manter o Premium, assine antes do fim.`
        },
        'pt-BR',
        props
    );
}

function endingEn(props: TemplateProps): MailContent {
    const endsAt: string = valueOf(props, 'endsAt');
    return noticeContent(
        {
            subject: `Your Premium trial ends on ${endsAt}`,
            title: 'Your trial is ending',
            body: `Your Premium trial ends on ${endsAt}. After that the account goes back to Free, and WhatsApp and Google Calendar are disconnected. Your portfolio and spending stay as they are. To keep Premium, subscribe before it ends.`
        },
        'en',
        props
    );
}

function endedPtBr(props: TemplateProps): MailContent {
    return noticeContent(
        {
            subject: 'Seu teste do Premium acabou',
            title: 'Teste encerrado',
            body: 'O teste do Premium acabou e a conta voltou ao Free. O WhatsApp e o Google Agenda foram desconectados; sua carteira e seus gastos continuam como estão. Você pode assinar o Premium quando quiser.'
        },
        'pt-BR',
        props
    );
}

function endedEn(props: TemplateProps): MailContent {
    return noticeContent(
        {
            subject: 'Your Premium trial has ended',
            title: 'Trial ended',
            body: 'Your Premium trial has ended and the account is back on Free. WhatsApp and Google Calendar were disconnected; your portfolio and spending stay as they are. You can subscribe to Premium whenever you want.'
        },
        'en',
        props
    );
}

@Injectable()
export class TrialTemplates implements OnModuleInit {
    public constructor(private readonly registry: TemplateRegistry) {}

    public onModuleInit(): void {
        this.registry.register(TRIAL_ENDING_TEMPLATE, 'pt-BR', endingPtBr);
        this.registry.register(TRIAL_ENDING_TEMPLATE, 'en', endingEn);
        this.registry.register(TRIAL_ENDED_TEMPLATE, 'pt-BR', endedPtBr);
        this.registry.register(TRIAL_ENDED_TEMPLATE, 'en', endedEn);
    }
}
