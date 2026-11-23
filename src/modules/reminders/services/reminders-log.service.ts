import { Injectable } from '@nestjs/common';
import { LogService } from '../../../core/observability/log.service';

const LOG_IDENTIFIER: string = 'reminders';

@Injectable()
export class RemindersLogService {
    public constructor(private readonly logService: LogService) {}

    public created(kind: string): void {
        this.logService.info({ message: 'reminder created', identifier: LOG_IDENTIFIER, meta: { kind } });
    }

    public fired(channel: string): void {
        this.logService.info({ message: 'reminder fired', identifier: LOG_IDENTIFIER, meta: { channel } });
    }

    public missed(reason: string): void {
        this.logService.warn({ message: 'reminder missed', identifier: LOG_IDENTIFIER, meta: { reason } });
    }

    public unreached(reason: string): void {
        this.logService.warn({ message: 'reminder not delivered', identifier: LOG_IDENTIFIER, meta: { reason } });
    }

    public canceled(reason: string, reminders: number): void {
        this.logService.info({ message: 'reminders canceled', identifier: LOG_IDENTIFIER, meta: { reason, reminders } });
    }

    public sweepRequeued(requeued: number, missed: number): void {
        this.logService.info({ message: 'reminders sweep finished', identifier: LOG_IDENTIFIER, meta: { requeued, missed } });
    }
}
