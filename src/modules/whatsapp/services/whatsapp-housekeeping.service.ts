import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { whatsappConfig } from '../config/whatsapp.config';
import { WebhookEventDomain } from '../domain/webhook-event.domain';
import { WhatsAppMessageDomain } from '../domain/whatsapp-message.domain';
import { EVENT_RETENTION_DAYS, RETENTION_BATCH } from '../domain/whatsapp.types';

const DAY_MS: number = 86_400_000;
const MILLISECONDS: number = 1000;

@Injectable()
export class WhatsAppHousekeepingService {
    public constructor(
        private readonly events: WebhookEventDomain,
        private readonly messages: WhatsAppMessageDomain,
        @Inject(whatsappConfig.KEY) private readonly config: ConfigType<typeof whatsappConfig>
    ) {}

    public async purge(now: Date = new Date()): Promise<void> {
        const textCutoff: Date = new Date(now.getTime() - this.config.WHATSAPP_TEXT_RETENTION_DAYS * DAY_MS);
        const eventCutoff: Date = new Date(now.getTime() - EVENT_RETENTION_DAYS * DAY_MS);
        await this.drain(async () => this.messages.purgeTextBefore(textCutoff, RETENTION_BATCH));
        await this.drain(async () => this.events.purgeFinishedBefore(eventCutoff, RETENTION_BATCH));
    }

    public async lastWebhookAgeSeconds(now: Date = new Date()): Promise<number | null> {
        const last: Date | null = await this.events.lastReceivedAt();
        return last === null ? null : Math.floor((now.getTime() - last.getTime()) / MILLISECONDS);
    }

    private async drain(step: () => Promise<number>): Promise<void> {
        let purged: number = await step();
        while (purged === RETENTION_BATCH) {
            purged = await step();
        }
    }
}
