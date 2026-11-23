import { Injectable } from '@nestjs/common';
import { AccountDataExporterPort } from '../../identity/services/account-data-exporter.port';
import { AiConsent, AiConsentExport } from '../domain/ai-assistant.types';
import { AiConsentDomain } from '../domain/ai-consent.domain';

export const AI_CONSENT_EXPORT_AREA: string = 'ai_consent';

@Injectable()
export class AiConsentExporter extends AccountDataExporterPort {
    public readonly area: string = AI_CONSENT_EXPORT_AREA;

    public constructor(private readonly consents: AiConsentDomain) {
        super();
    }

    public async exportAll(): Promise<AiConsentExport | null> {
        const consent: AiConsent | null = await this.consents.current();
        if (consent === null) {
            return null;
        }
        return {
            grantedAt: consent.grantedAt.toISOString(),
            noticeVersion: consent.noticeVersion,
            source: consent.source,
            revokedAt: consent.revokedAt === null ? null : consent.revokedAt.toISOString()
        };
    }
}
