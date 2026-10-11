import { Injectable } from '@nestjs/common';
import { AppLocale } from '../../shared/i18n/locale';
import { MESSAGE_TYPES, QUEUES } from '../../shared/constants/queues.constants';
import { QueuePublisherPort } from '../queue/queue.types';
import { TemplateProps } from './template.registry';
import { MailRecipient, MailSender } from './mail.types';

export interface EnqueueMailRequest {
    readonly template: string;
    readonly locale: AppLocale;
    readonly props: TemplateProps;
    readonly to: MailRecipient;
    readonly sender?: MailSender;
    readonly unsubscribeUrl?: string;
    readonly reference?: string;
}

export abstract class MailerPort {
    public abstract enqueue(request: EnqueueMailRequest): Promise<void>;
}

@Injectable()
export class QueueMailer extends MailerPort {
    public constructor(private readonly publisher: QueuePublisherPort) {
        super();
    }

    public async enqueue(request: EnqueueMailRequest): Promise<void> {
        await this.publisher.publish(QUEUES.emailSend, MESSAGE_TYPES.emailSendRequested, request, {
            jobId: this.jobIdOf(request)
        });
    }

    private jobIdOf(request: EnqueueMailRequest): string | undefined {
        return request.reference ? `email-${request.template}-${request.reference}` : undefined;
    }
}
