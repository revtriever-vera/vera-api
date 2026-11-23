import { Injectable } from '@nestjs/common';
import { LogEntry, LogService } from '../../../core/observability/log.service';

const WEBHOOK: string = 'whatsapp-webhook';
const SEND: string = 'whatsapp-send';
const TEMPLATES: string = 'whatsapp-templates';
const HEALTH: string = 'whatsapp-health';

export type SendLogFields = {
    readonly kind: string;
    readonly template: string | null;
    readonly outcome: string;
    readonly errorCode: string | null;
};

@Injectable()
export class WhatsAppLogService {
    public constructor(private readonly logService: LogService) {}

    public failureObserverFailed(error: unknown): void {
        this.logService.error({
            message: 'whatsapp outbound failure observer failed',
            identifier: SEND,
            meta: { detail: error instanceof Error ? error.message : String(error) }
        });
    }

    public webhookBatch(items: number, kinds: Readonly<Record<string, number>>): void {
        this.logService.info({ message: 'whatsapp webhook batch processed', identifier: WEBHOOK, meta: { items, kinds } });
    }

    public signatureRejected(channelKey: string | null): void {
        this.logService.warn({ message: 'whatsapp webhook signature rejected', identifier: WEBHOOK, meta: { channelKey } });
    }

    public channelUnknown(): void {
        this.logService.warn({ message: 'whatsapp webhook for an unknown channel', identifier: WEBHOOK, meta: { channelKey: null } });
    }

    public bodyInvalid(channelKey: string): void {
        this.logService.warn({ message: 'whatsapp webhook body invalid after signature', identifier: WEBHOOK, meta: { channelKey } });
    }

    public misconfigured(reason: string): void {
        this.logService.error({ message: 'whatsapp webhook cannot be validated', identifier: WEBHOOK, meta: { reason } });
    }

    public send(fields: SendLogFields): void {
        const entry: LogEntry = { message: 'whatsapp send finished', identifier: SEND, meta: { ...fields } };
        if (fields.outcome === 'sent') {
            this.logService.info(entry);
            return;
        }
        if (fields.outcome === 'token_invalid') {
            this.logService.error(entry);
            return;
        }
        this.logService.warn(entry);
    }

    public templateStatus(name: string, language: string, status: string): void {
        const entry: LogEntry = { message: 'whatsapp template status', identifier: TEMPLATES, meta: { template: name, language, status } };
        if (status === 'paused') {
            this.logService.error(entry);
            return;
        }
        if (status === 'rejected') {
            this.logService.warn(entry);
            return;
        }
        this.logService.info(entry);
    }

    public syncFailed(channelKey: string, errorCode: string): void {
        this.logService.warn({ message: 'whatsapp template sync failed', identifier: TEMPLATES, meta: { channelKey, errorCode } });
    }

    public channelSkipped(reason: string): void {
        this.logService.warn({ message: 'whatsapp channel skipped', identifier: TEMPLATES, meta: { reason } });
    }

    public quality(channelKey: string, rating: string, tier: string | null): void {
        const entry: LogEntry = { message: 'whatsapp number quality', identifier: HEALTH, meta: { channelKey, rating, tier } };
        if (rating === 'YELLOW' || rating === 'RED') {
            this.logService.error(entry);
            return;
        }
        this.logService.info(entry);
    }

    public healthFailed(channelKey: string, errorCode: string): void {
        this.logService.error({ message: 'whatsapp number health check failed', identifier: HEALTH, meta: { channelKey, errorCode } });
    }

    public tokenInvalid(channelKey: string): void {
        this.logService.error({ message: 'whatsapp access token rejected', identifier: HEALTH, meta: { channelKey, tokenInvalid: true } });
    }
}
