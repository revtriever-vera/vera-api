import { Injectable } from '@nestjs/common';
import { HashUtil } from '../../../shared/utils/hash.util';
import { WhatsAppWebhookEventsRepository } from '../repositories/whatsapp-webhook-events.repository';
import { WebhookEvent, WebhookEventStatus } from './whatsapp.types';

export type StoredEvent = { readonly event: WebhookEvent; readonly created: boolean };

@Injectable()
export class WebhookEventDomain {
    public constructor(private readonly events: WhatsAppWebhookEventsRepository) {}

    public async store(rawBody: string, signatureHeader: string | null): Promise<StoredEvent | null> {
        const sha: string = HashUtil.sha256(rawBody);
        const inserted: WebhookEvent | null = await this.events.insertIfAbsent(sha, rawBody, signatureHeader);
        if (inserted !== null) {
            return { event: inserted, created: true };
        }
        const existing: WebhookEvent | null = await this.events.findBySha(sha);
        return existing === null ? null : { event: existing, created: false };
    }

    public async find(id: string): Promise<WebhookEvent | null> {
        return this.events.findById(id);
    }

    public async finish(id: string, status: WebhookEventStatus, channelKey: string | null): Promise<boolean> {
        return this.events.finish(id, status, channelKey);
    }

    public async lastReceivedAt(): Promise<Date | null> {
        return this.events.lastReceivedAt();
    }

    public async purgeFinishedBefore(cutoff: Date, batch: number): Promise<number> {
        return this.events.purgeFinishedBefore(cutoff, batch);
    }
}
