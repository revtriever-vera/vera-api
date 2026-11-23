import { Injectable } from '@nestjs/common';
import { LogService } from '../../../core/observability/log.service';
import { AiConsentSource, AiPayloadKind } from '../domain/ai-assistant.types';

const CONSENT_IDENTIFIER: string = 'ai-consent';
const PAYLOAD_IDENTIFIER: string = 'ai-payload';

@Injectable()
export class AiAssistantLogService {
    public constructor(private readonly logService: LogService) {}

    public granted(noticeVersion: number, source: AiConsentSource): void {
        this.logService.info({ message: 'ai consent granted', identifier: CONSENT_IDENTIFIER, meta: { noticeVersion, source } });
    }

    public revoked(purged: number): void {
        this.logService.info({ message: 'ai consent revoked', identifier: CONSENT_IDENTIFIER, meta: { purged } });
    }

    public payloadBuilt(kind: AiPayloadKind, bytes: number): void {
        this.logService.debug({ message: 'ai payload built', identifier: PAYLOAD_IDENTIFIER, meta: { kind, bytes } });
    }
}
