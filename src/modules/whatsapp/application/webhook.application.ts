import { Injectable } from '@nestjs/common';
import { QueuePublisherPort } from '../../../core/queue/queue.types';
import { MESSAGE_TYPES, QUEUES } from '../../../shared/constants/queues.constants';
import { IdUtil } from '../../../shared/utils/id.util';
import { inboundMessagesOf, statusUpdatesOf } from '../domain/inbound.mapper';
import { StoredEvent, WebhookEventDomain } from '../domain/webhook-event.domain';
import { WebhookVerificationFailedError, WhatsAppMisconfiguredError, WhatsAppProviderDisabledError } from '../domain/whatsapp.errors';
import {
    InboundMessage,
    StatusUpdate,
    WEBHOOK_EVENT_STATUSES,
    WebhookEvent,
    WebhookEventStatus,
    WhatsAppChannel
} from '../domain/whatsapp.types';
import { SignatureVerifier } from '../services/signature.verifier';
import { WebhookBodyService } from '../services/webhook-body.service';
import { WhatsAppChannelService } from '../services/whatsapp-channel.service';
import { WhatsAppEventProcessor } from '../services/whatsapp-event-processor.service';
import { WhatsAppLogService } from '../services/whatsapp-log.service';
import { WhatsAppMetricsService } from '../services/whatsapp-metrics.service';
import { DevInboundBody, VerificationQuery, WebhookBody } from '../validation/whatsapp-webhook.schemas';

const SUBSCRIBE: string = 'subscribe';
const MILLISECONDS: number = 1000;

@Injectable()
export class WebhookApplication {
    public constructor(
        private readonly events: WebhookEventDomain,
        private readonly channels: WhatsAppChannelService,
        private readonly signature: SignatureVerifier,
        private readonly bodies: WebhookBodyService,
        private readonly processor: WhatsAppEventProcessor,
        private readonly publisher: QueuePublisherPort,
        private readonly logs: WhatsAppLogService,
        private readonly metrics: WhatsAppMetricsService
    ) {}

    public async verify(query: VerificationQuery): Promise<string> {
        const token: string | undefined = query['hub.verify_token'];
        const challenge: string | undefined = query['hub.challenge'];
        if (query['hub.mode'] !== SUBSCRIBE || token === undefined || challenge === undefined) {
            throw new WebhookVerificationFailedError();
        }
        if ((await this.channels.byVerifyToken(token)) === null) {
            throw new WebhookVerificationFailedError();
        }
        return challenge;
    }

    public async receive(rawBody: string, signatureHeader: string | null): Promise<void> {
        const stored: StoredEvent | null = await this.events.store(rawBody, signatureHeader);
        if (stored?.event.status !== WEBHOOK_EVENT_STATUSES.received) {
            this.metrics.webhook('event', 'duplicate');
            return;
        }
        await this.publisher.publish(
            QUEUES.whatsapp,
            MESSAGE_TYPES.whatsappWebhookReceived,
            { eventId: stored.event.id },
            { jobId: `wa-webhook-${stored.event.id}` }
        );
        this.metrics.webhook('event', stored.created ? 'stored' : 'republished');
    }

    public async processEvent(eventId: string): Promise<void> {
        const event: WebhookEvent | null = await this.events.find(eventId);
        if (event?.status !== WEBHOOK_EVENT_STATUSES.received) {
            return;
        }
        const channel: WhatsAppChannel | null = await this.channelFor(event.rawBody);
        if (channel === null) {
            await this.close(event, WEBHOOK_EVENT_STATUSES.rejected, null);
            this.logs.channelUnknown();
            return;
        }
        await this.validateAndFanOut(event, channel);
    }

    public async processInbound(eventId: string, wamid: string): Promise<void> {
        const loaded: { event: WebhookEvent; body: WebhookBody } | null = await this.load(eventId);
        const message: InboundMessage | undefined =
            loaded === null ? undefined : inboundMessagesOf(loaded.body).find((entry: InboundMessage) => entry.wamid === wamid);
        if (loaded === null || message === undefined) {
            return;
        }
        const channel: WhatsAppChannel | null = await this.channels.byKey(loaded.event.channelKey ?? '');
        if (channel === null) {
            throw new WhatsAppMisconfiguredError('channel_missing');
        }
        if (channel.companyId === null) {
            await this.processor.processHosted(message, channel);
            return;
        }
        await this.processor.processTenant(channel.companyId, message, channel);
    }

    public async processStatus(eventId: string, wamid: string, status: StatusUpdate['status']): Promise<void> {
        const loaded: { event: WebhookEvent; body: WebhookBody } | null = await this.load(eventId);
        const update: StatusUpdate | undefined =
            loaded === null ? undefined : statusUpdatesOf(loaded.body).find((entry) => entry.wamid === wamid && entry.status === status);
        if (update === undefined) {
            return;
        }
        const advanced: boolean = await this.processor.advance(update);
        this.metrics.message('out', 'status', advanced ? update.status : 'ignored');
    }

    public async simulateInbound(input: DevInboundBody): Promise<void> {
        const channel: WhatsAppChannel | null = await this.devChannel(input.phoneNumberId);
        if (channel === null) {
            throw new WhatsAppProviderDisabledError();
        }
        const rawBody: string = JSON.stringify(devPayloadOf(channel.phoneNumberId, input));
        await this.receive(rawBody, this.signature.sign(rawBody, channel.appSecret));
    }

    private async devChannel(phoneNumberId: string | undefined): Promise<WhatsAppChannel | null> {
        if (phoneNumberId !== undefined) {
            return this.channels.byPhoneNumberId(phoneNumberId);
        }
        return (await this.channels.listAll())[0] ?? null;
    }

    private async channelFor(rawBody: string): Promise<WhatsAppChannel | null> {
        if (this.channels.isHosted()) {
            return this.requireConfigured(await this.channels.current());
        }
        const ids: string[] = this.bodies.phoneNumberIds(rawBody);
        const id: string | undefined = ids[0];
        if (ids.length !== 1 || id === undefined) {
            return null;
        }
        return this.requireConfigured(await this.channels.byPhoneNumberId(id), true);
    }

    private requireConfigured(channel: WhatsAppChannel | null, nullIsUnknown: boolean = false): WhatsAppChannel | null {
        if (channel === null && nullIsUnknown) {
            return null;
        }
        if (channel === null || channel.appSecret.length === 0) {
            this.logs.misconfigured(channel === null ? 'channel_missing' : 'app_secret_missing');
            throw new WhatsAppMisconfiguredError(channel === null ? 'channel_missing' : 'app_secret_missing');
        }
        return channel;
    }

    private async validateAndFanOut(event: WebhookEvent, channel: WhatsAppChannel): Promise<void> {
        const key: string = this.channels.keyOf(channel);
        if (!this.signature.verify(event.rawBody, event.signatureHeader, channel.appSecret)) {
            await this.close(event, WEBHOOK_EVENT_STATUSES.rejected, key);
            this.logs.signatureRejected(key);
            return;
        }
        const body: WebhookBody | null = this.bodies.parse(event.rawBody);
        if (body === null || !this.samePhone(event.rawBody, channel)) {
            await this.close(event, WEBHOOK_EVENT_STATUSES.invalid, key);
            this.logs.bodyInvalid(key);
            return;
        }
        await this.events.rememberChannel(event.id, key);
        await this.fanOut(event.id, body);
        await this.close(event, WEBHOOK_EVENT_STATUSES.processed, key);
    }

    private samePhone(rawBody: string, channel: WhatsAppChannel): boolean {
        const ids: string[] = this.bodies.phoneNumberIds(rawBody);
        return ids.length === 1 && ids[0] === channel.phoneNumberId;
    }

    private async fanOut(eventId: string, body: WebhookBody): Promise<void> {
        const inbound: InboundMessage[] = inboundMessagesOf(body);
        const statuses: StatusUpdate[] = statusUpdatesOf(body);
        for (const message of inbound) {
            await this.publisher.publish(
                QUEUES.whatsapp,
                MESSAGE_TYPES.whatsappInboundReceived,
                { eventId, wamid: message.wamid },
                { jobId: `wa-inbound-${message.wamid}` }
            );
        }
        for (const update of statuses) {
            await this.publisher.publish(
                QUEUES.whatsapp,
                MESSAGE_TYPES.whatsappStatusReceived,
                { eventId, wamid: update.wamid, status: update.status },
                { jobId: `wa-status-${update.wamid}-${update.status}` }
            );
        }
        this.logs.webhookBatch(inbound.length + statuses.length, { messages: inbound.length, statuses: statuses.length });
        this.metrics.webhook('message', 'accepted');
    }

    private async load(eventId: string): Promise<{ event: WebhookEvent; body: WebhookBody } | null> {
        const event: WebhookEvent | null = await this.events.find(eventId);
        const body: WebhookBody | null = event === null ? null : this.bodies.parse(event.rawBody);
        return event === null || body === null ? null : { event, body };
    }

    private async close(event: WebhookEvent, status: WebhookEventStatus, channelKey: string | null): Promise<void> {
        await this.events.finish(event.id, status, channelKey);
    }
}

function devMessageOf(input: DevInboundBody): Record<string, unknown> {
    return {
        from: input.from,
        id: `wamid.dev.${IdUtil.newId()}`,
        timestamp: String(Math.floor(Date.now() / MILLISECONDS)),
        type: 'text',
        text: { body: input.text }
    };
}

function devPayloadOf(phoneNumberId: string, input: DevInboundBody): Record<string, unknown> {
    const value: Record<string, unknown> = {
        messaging_product: 'whatsapp',
        metadata: { phone_number_id: phoneNumberId },
        messages: [devMessageOf(input)]
    };
    return { object: 'whatsapp_business_account', entry: [{ id: 'dev', changes: [{ field: 'messages', value }] }] };
}
