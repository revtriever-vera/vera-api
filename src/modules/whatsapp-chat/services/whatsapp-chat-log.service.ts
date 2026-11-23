import { Injectable } from '@nestjs/common';
import { LogService } from '../../../core/observability/log.service';
import { ChatRouteName } from '../domain/whatsapp-chat.types';

const LOG_IDENTIFIER: string = 'whatsapp-chat';

@Injectable()
export class WhatsAppChatLogService {
    public constructor(private readonly logService: LogService) {}

    public routed(route: ChatRouteName, latencyMs: number, linkId: string | null): void {
        this.logService.info({
            message: 'whatsapp chat routed',
            identifier: LOG_IDENTIFIER,
            meta: { route, latencyMs, linkId }
        });
    }

    public turnFailed(code: string, linkId: string): void {
        this.logService.warn({ message: 'whatsapp chat turn failed', identifier: LOG_IDENTIFIER, meta: { code, linkId } });
    }

    public actionFailed(kind: string, linkId: string): void {
        this.logService.warn({ message: 'whatsapp chat action failed', identifier: LOG_IDENTIFIER, meta: { kind, linkId } });
    }
}
