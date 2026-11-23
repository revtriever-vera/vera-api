import { Injectable } from '@nestjs/common';
import { MetricsService } from '../../../core/observability/metrics.service';

const WEBHOOK_TOTAL: string = 'vera_whatsapp_webhook_total';
const MESSAGES_TOTAL: string = 'vera_whatsapp_messages_total';
const SEND_DURATION: string = 'vera_whatsapp_send_duration_ms';
const QUALITY: string = 'vera_whatsapp_quality';
const LAST_WEBHOOK_AGE: string = 'vera_whatsapp_last_webhook_age_seconds';
const QUALITY_SCORE: Readonly<Record<string, number>> = { GREEN: 2, YELLOW: 1, RED: 0 };

@Injectable()
export class WhatsAppMetricsService {
    public constructor(private readonly metrics: MetricsService) {}

    public webhook(kind: string, outcome: string): void {
        this.metrics.count(WEBHOOK_TOTAL, { kind, outcome });
    }

    public message(direction: string, kind: string, status: string): void {
        this.metrics.count(MESSAGES_TOTAL, { direction, kind, status });
    }

    public sendDuration(milliseconds: number): void {
        this.metrics.observe(SEND_DURATION, milliseconds);
    }

    public quality(channel: 'hosted' | 'self_hosted', rating: string): void {
        const score: number | undefined = QUALITY_SCORE[rating];
        if (score !== undefined) {
            this.metrics.gauge(QUALITY, score, { channel });
        }
    }

    public lastWebhookAge(seconds: number): void {
        this.metrics.gauge(LAST_WEBHOOK_AGE, seconds);
    }
}
