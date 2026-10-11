import { Injectable } from '@nestjs/common';
import { LogService } from '../observability/log.service';

const LOG_IDENTIFIER: string = 'email-send';

@Injectable()
export class MailLogService {
    public constructor(private readonly logService: LogService) {}

    public recipientBlocked(domain: string): void {
        this.logService.warn({
            message: 'email discarded, recipient is not on the sandbox allowlist',
            identifier: LOG_IDENTIFIER,
            meta: { domain }
        });
    }

    public emailAccepted(template: string, provider: string): void {
        this.logService.info({
            message: 'email accepted by provider',
            identifier: LOG_IDENTIFIER,
            meta: { template, provider }
        });
    }

    public emailGaveUp(template: string, error: unknown): void {
        this.logService.error({
            message: 'email delivery gave up after exhausting retries',
            identifier: LOG_IDENTIFIER,
            meta: { template },
            error
        });
    }
}
