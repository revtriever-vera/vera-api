import { Injectable } from '@nestjs/common';
import { MESSAGE_TYPES, QUEUES, QueueName } from '../../../shared/constants/queues.constants';
import { HandleJobFailure } from '../../queue/handle-job-failure.decorator';
import { QueueEnvelope, QueueHandlerPort } from '../../queue/queue.types';
import { MailLogService } from '../mail-log.service';
import { BLOCKED_PROVIDER } from '../allowlist-mail.port';
import { EnqueueMailRequest } from '../mailer.port';
import { MailPort } from '../mail.port';
import { MailContent, MailReceipt } from '../mail.types';
import { TemplateRegistry } from '../template.registry';

@Injectable()
export class EmailSendHandler extends QueueHandlerPort<EnqueueMailRequest> {
    public readonly queue: QueueName = QUEUES.emailSend;
    public readonly type: string = MESSAGE_TYPES.emailSendRequested;

    public constructor(
        private readonly registry: TemplateRegistry,
        private readonly mail: MailPort,
        private readonly logs: MailLogService
    ) {
        super();
    }

    @HandleJobFailure()
    public async handle(envelope: QueueEnvelope<EnqueueMailRequest>): Promise<void> {
        const request: EnqueueMailRequest = envelope.payload;
        const content: MailContent = this.registry.render(request.template, request.locale, request.props);
        const receipt: MailReceipt = await this.mail.send({
            ...content,
            to: request.to,
            sender: request.sender,
            locale: request.locale,
            unsubscribeUrl: request.unsubscribeUrl,
            tags: { template: request.template }
        });
        this.record(request.template, receipt);
    }

    public handleJobFailure(envelope: QueueEnvelope<EnqueueMailRequest>, error: unknown): Promise<void> {
        this.logs.emailGaveUp(envelope.payload.template, error);
        return Promise.resolve();
    }

    private record(template: string, receipt: MailReceipt): void {
        if (receipt.provider === BLOCKED_PROVIDER) {
            return;
        }
        this.logs.emailAccepted(template, receipt.provider);
    }
}
