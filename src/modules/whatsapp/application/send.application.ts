import { Injectable } from '@nestjs/common';
import { ChannelHealthDomain } from '../domain/channel-health.domain';
import { WhatsAppMessageDomain } from '../domain/whatsapp-message.domain';
import { MESSAGE_KINDS, SentMessage, WhatsAppChannel, WhatsAppMessage } from '../domain/whatsapp.types';
import { WhatsAppCloudPort, WhatsAppGraphError } from '../ports/whatsapp-cloud.port';
import { isRetryable } from '../domain/graph-error.mapper';
import { MockOutbox, MockSentMessage } from '../services/mock-outbox.service';
import { OutboundFailureRegistry } from '../services/outbound-failure.registry';
import { WhatsAppChannelService } from '../services/whatsapp-channel.service';
import { WhatsAppMetricsService } from '../services/whatsapp-metrics.service';
import { WhatsAppWindowService } from '../services/whatsapp-window.service';
import { outboundPayloadSchema } from '../validation/whatsapp-jobs.schemas';

@Injectable()
export class SendApplication {
    public constructor(
        private readonly messages: WhatsAppMessageDomain,
        private readonly health: ChannelHealthDomain,
        private readonly channels: WhatsAppChannelService,
        private readonly window: WhatsAppWindowService,
        private readonly port: WhatsAppCloudPort,
        private readonly outbox: MockOutbox,
        private readonly metrics: WhatsAppMetricsService,
        private readonly failures: OutboundFailureRegistry
    ) {}

    public devOutbox(): readonly MockSentMessage[] {
        return this.outbox.list();
    }

    public async process(messageId: string, lastAttempt: boolean): Promise<void> {
        const message: WhatsAppMessage | null = await this.messages.find(messageId);
        if (message?.status !== 'queued') {
            return;
        }
        const channel: WhatsAppChannel | null = await this.channels.current();
        const refusal: string | null = await this.refusalOf(message, channel);
        if (refusal !== null || channel === null) {
            await this.end(message, refusal === 'recipient_not_allowed' ? 'blocked' : 'failed', refusal ?? 'provider_disabled');
            return;
        }
        if (!(await this.messages.claimSending(message.id))) {
            return;
        }
        await this.deliver(message, channel, lastAttempt);
    }

    private async refusalOf(message: WhatsAppMessage, channel: WhatsAppChannel | null): Promise<string | null> {
        if (channel === null) {
            return 'provider_disabled';
        }
        if (!this.channels.isRecipientAllowed(message.peer)) {
            return 'recipient_not_allowed';
        }
        const needsWindow: boolean = message.kind !== MESSAGE_KINDS.template;
        return needsWindow && !(await this.window.isOpen(message.peer)) ? 'window_closed' : null;
    }

    private async deliver(message: WhatsAppMessage, channel: WhatsAppChannel, lastAttempt: boolean): Promise<void> {
        try {
            const sent: SentMessage = await this.dispatch(message, channel);
            await this.messages.markSent(message.id, sent.wamid);
            this.metrics.message('out', message.kind, 'sent');
        } catch (error: unknown) {
            await this.onFailure(message, channel, error, lastAttempt);
        }
    }

    private async onFailure(message: WhatsAppMessage, channel: WhatsAppChannel, error: unknown, lastAttempt: boolean): Promise<void> {
        const failure: WhatsAppGraphError | null = error instanceof WhatsAppGraphError ? error : null;
        const retryable: boolean = failure === null || isRetryable(failure);
        if (retryable && !lastAttempt) {
            await this.messages.releaseSending(message.id);
            throw error;
        }
        if (failure?.kind === 'token_invalid') {
            await this.health.markTokenInvalid(this.channels.keyOf(channel));
        }
        await this.end(message, 'failed', failure?.errorCode ?? 'unexpected');
    }

    private async end(message: WhatsAppMessage, status: 'failed' | 'blocked', errorCode: string): Promise<void> {
        await this.messages.markEnded(message.id, status, errorCode);
        this.metrics.message('out', message.kind, status);
        await this.failures.notify({ messageId: message.id, kind: message.kind, errorCode });
    }

    private async dispatch(message: WhatsAppMessage, channel: WhatsAppChannel): Promise<SentMessage> {
        const payload: ReturnType<typeof outboundPayloadSchema.safeParse> = outboundPayloadSchema.safeParse(message.payload);
        if (message.kind === MESSAGE_KINDS.template && payload.success && 'template' in payload.data) {
            const { language, variables, buttonPayloads } = payload.data.template;
            return this.port.sendTemplate(channel, message.peer, { name: message.templateName ?? '', language, variables, buttonPayloads });
        }
        if (message.kind === MESSAGE_KINDS.interactive && payload.success && 'choices' in payload.data) {
            return this.port.sendInteractive(channel, message.peer, { body: message.body ?? '', choices: payload.data.choices });
        }
        return this.port.sendText(channel, message.peer, message.body ?? '');
    }
}
