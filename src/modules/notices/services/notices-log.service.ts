import { Injectable } from '@nestjs/common';
import { LogService } from '../../../core/observability/log.service';

const LOG_IDENTIFIER: string = 'notices';

@Injectable()
export class NoticesLogService {
    public constructor(private readonly logService: LogService) {}

    public sent(type: string, noticeId: string): void {
        this.logService.info({ message: 'notice enqueued', identifier: LOG_IDENTIFIER, meta: { type, noticeId } });
    }

    public released(type: string, noticeId: string, error: unknown): void {
        this.logService.warn({ message: 'notice enqueue failed', identifier: LOG_IDENTIFIER, meta: { type, noticeId }, error });
    }

    public unsubscribed(type: string): void {
        this.logService.info({ message: 'notice unsubscribed', identifier: LOG_IDENTIFIER, meta: { type } });
    }
}
