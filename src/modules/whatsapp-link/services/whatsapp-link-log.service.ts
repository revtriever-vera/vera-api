import { Injectable } from '@nestjs/common';
import { LogService } from '../../../core/observability/log.service';

const LOG_IDENTIFIER: string = 'whatsapp-link';
const HASH_PREFIX_LENGTH: number = 8;

export type RejectReason = 'unknown_or_expired' | 'phone_in_use';

@Injectable()
export class WhatsAppLinkLogService {
    public constructor(private readonly logService: LogService) {}

    public codeIssued(): void {
        this.logService.info({ message: 'whatsapp link code issued', identifier: LOG_IDENTIFIER });
    }

    public linked(phoneHash: string): void {
        this.logService.info({
            message: 'whatsapp number linked',
            identifier: LOG_IDENTIFIER,
            meta: { phoneHash: phoneHash.slice(0, HASH_PREFIX_LENGTH) }
        });
    }

    public codeRejected(reason: RejectReason, phoneHash: string): void {
        this.logService.warn({
            message: 'whatsapp link code rejected',
            identifier: LOG_IDENTIFIER,
            meta: { reason, phoneHash: phoneHash.slice(0, HASH_PREFIX_LENGTH) }
        });
    }

    public unlinked(reason: string): void {
        this.logService.info({ message: 'whatsapp number unlinked', identifier: LOG_IDENTIFIER, meta: { reason } });
    }

    public replyFailed(): void {
        this.logService.warn({ message: 'whatsapp link reply not delivered', identifier: LOG_IDENTIFIER });
    }

    public welcomeFailed(): void {
        this.logService.warn({ message: 'whatsapp link welcome not queued', identifier: LOG_IDENTIFIER });
    }
}
