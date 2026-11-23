import { Injectable } from '@nestjs/common';
import { ChatRouteName } from '../domain/whatsapp-chat.types';
import { WhatsAppChatLogService } from './whatsapp-chat-log.service';
import { WhatsAppChatMetricsService } from './whatsapp-chat-metrics.service';

@Injectable()
export class ChatTelemetry {
    public constructor(
        private readonly logs: WhatsAppChatLogService,
        private readonly metrics: WhatsAppChatMetricsService
    ) {}

    public routed(route: ChatRouteName, linkId: string | null, latencyMs: number | null): void {
        this.metrics.routed(route);
        this.logs.routed(route, latencyMs ?? 0, linkId);
        if (latencyMs !== null) {
            this.metrics.latency(latencyMs);
        }
    }

    public delivered(latencyMs: number): void {
        this.metrics.latency(latencyMs);
    }

    public limited(): void {
        this.metrics.limited();
    }

    public turnFailed(code: string, linkId: string): void {
        this.logs.turnFailed(code, linkId);
    }
}
