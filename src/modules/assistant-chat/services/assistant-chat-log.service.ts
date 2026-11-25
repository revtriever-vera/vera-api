import { Injectable } from '@nestjs/common';
import { LogService } from '../../../core/observability/log.service';
import { TurnMode } from '../domain/assistant-chat.types';

const LOG_IDENTIFIER: string = 'assistant-chat';

@Injectable()
export class AssistantChatLogService {
    public constructor(private readonly logService: LogService) {}

    public turnFinished(turnId: string, mode: TurnMode, outcome: string, latencyMs: number): void {
        this.logService.info({
            message: 'assistant turn finished',
            identifier: LOG_IDENTIFIER,
            meta: { turnId, mode, outcome, latencyMs }
        });
    }

    public turnFailed(turnId: string, mode: TurnMode, code: string): void {
        this.logService.warn({ message: 'assistant turn failed', identifier: LOG_IDENTIFIER, meta: { turnId, mode, code } });
    }

    public turnLost(turnId: string): void {
        this.logService.warn({ message: 'assistant turn expired', identifier: LOG_IDENTIFIER, meta: { turnId } });
    }

    public publishFailed(turnId: string, error: unknown): void {
        this.logService.error({ message: 'assistant turn publish failed', identifier: LOG_IDENTIFIER, meta: { turnId }, error });
    }

    public actionConfirmed(actionId: string, tool: string): void {
        this.logService.info({ message: 'assistant action confirmed', identifier: LOG_IDENTIFIER, meta: { actionId, tool } });
    }

    public actionStale(actionId: string, tool: string): void {
        this.logService.warn({ message: 'assistant action stale', identifier: LOG_IDENTIFIER, meta: { actionId, tool } });
    }

    public retention(conversations: number, messages: number): void {
        this.logService.info({ message: 'assistant retention purged', identifier: LOG_IDENTIFIER, meta: { conversations, messages } });
    }
}
