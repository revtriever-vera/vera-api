import { Injectable } from '@nestjs/common';
import { QueuePublisherPort } from '../../../core/queue/queue.types';
import { MESSAGE_TYPES, QUEUES } from '../../../shared/constants/queues.constants';
import {
    MESSAGE_KINDS,
    SEND_ATTEMPTS,
    SEND_BACKOFF_MS,
    InteractiveChoices,
    TemplateLanguage,
    WhatsAppChannel,
    WhatsAppMessage
} from '../domain/whatsapp.types';
import { currentTemplateName } from '../domain/template-catalog';
import { TemplateRegistrationDomain } from '../domain/template-registration.domain';
import { WhatsAppMessageDomain } from '../domain/whatsapp-message.domain';
import { splitIntoBlocks, toWhatsAppMarkup } from '../domain/whatsapp-format';
import { WhatsAppProviderDisabledError, WhatsAppTemplateUnavailableError, WhatsAppWindowClosedError } from '../domain/whatsapp.errors';
import { WhatsAppChannelService } from './whatsapp-channel.service';
import { WhatsAppWindowService } from './whatsapp-window.service';

@Injectable()
export class WhatsAppOutboundService {
    public constructor(
        private readonly messages: WhatsAppMessageDomain,
        private readonly registrations: TemplateRegistrationDomain,
        private readonly channels: WhatsAppChannelService,
        private readonly window: WhatsAppWindowService,
        private readonly publisher: QueuePublisherPort
    ) {}

    public async enqueueText(peer: string, markdown: string): Promise<string[]> {
        await this.requireOpenWindow(peer);
        const ids: string[] = [];
        for (const block of splitIntoBlocks(toWhatsAppMarkup(markdown))) {
            const message: WhatsAppMessage = await this.messages.queue({
                peer,
                kind: MESSAGE_KINDS.text,
                body: block,
                templateName: null,
                payload: null
            });
            await this.publish(message.id);
            ids.push(message.id);
        }
        return ids;
    }

    public async enqueueInteractive(peer: string, interactive: InteractiveChoices): Promise<string> {
        await this.requireOpenWindow(peer);
        const message: WhatsAppMessage = await this.messages.queue({
            peer,
            kind: MESSAGE_KINDS.interactive,
            body: interactive.body,
            templateName: null,
            payload: { choices: interactive.choices }
        });
        await this.publish(message.id);
        return message.id;
    }

    public async enqueueTemplate(
        peer: string,
        templateKey: string,
        language: TemplateLanguage,
        variables: readonly string[]
    ): Promise<string> {
        const channel: WhatsAppChannel = await this.requireChannel();
        const name: string | null = currentTemplateName(templateKey);
        if (name === null || !(await this.registrations.isApproved(this.channels.keyOf(channel), name, language))) {
            throw new WhatsAppTemplateUnavailableError(templateKey);
        }
        const message: WhatsAppMessage = await this.messages.queue({
            peer,
            kind: MESSAGE_KINDS.template,
            body: null,
            templateName: name,
            payload: { template: { language, variables } }
        });
        await this.publish(message.id);
        return message.id;
    }

    private async requireChannel(): Promise<WhatsAppChannel> {
        const channel: WhatsAppChannel | null = await this.channels.current();
        if (channel === null) {
            throw new WhatsAppProviderDisabledError();
        }
        return channel;
    }

    private async requireOpenWindow(peer: string): Promise<void> {
        await this.requireChannel();
        if (!(await this.window.isOpen(peer))) {
            throw new WhatsAppWindowClosedError();
        }
    }

    private async publish(messageId: string): Promise<void> {
        await this.publisher.publish(
            QUEUES.whatsapp,
            MESSAGE_TYPES.whatsappSendRequested,
            { messageId },
            { jobId: `wa-send-${messageId}`, attempts: SEND_ATTEMPTS, backoffDelayMs: SEND_BACKOFF_MS }
        );
    }
}
