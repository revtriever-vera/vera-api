import { Injectable } from '@nestjs/common';
import { MetricsService } from '../../../core/observability/metrics.service';
import { ChatRouteName } from '../domain/whatsapp-chat.types';

const CHAT_TOTAL: string = 'vera_whatsapp_chat_total';
const CHAT_LATENCY: string = 'vera_whatsapp_chat_latency_ms';
const CHAT_LIMITED_TOTAL: string = 'vera_whatsapp_chat_limited_total';

@Injectable()
export class WhatsAppChatMetricsService {
    public constructor(private readonly metrics: MetricsService) {}

    public routed(route: ChatRouteName): void {
        this.metrics.count(CHAT_TOTAL, { route });
    }

    public latency(milliseconds: number): void {
        this.metrics.observe(CHAT_LATENCY, milliseconds);
    }

    public limited(): void {
        this.metrics.count(CHAT_LIMITED_TOTAL, {});
    }
}
