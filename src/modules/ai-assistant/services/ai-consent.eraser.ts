import { Injectable } from '@nestjs/common';
import { AsCompany } from '../../../core/context/as-company.decorator';
import { AccountDataEraserPort } from '../../identity/services/account-data-eraser.port';
import { AiConsentDomain } from '../domain/ai-consent.domain';

export const AI_CONSENT_ERASE_AREA: string = 'ai_consents';

@Injectable()
export class AiConsentEraser extends AccountDataEraserPort {
    public readonly area: string = AI_CONSENT_ERASE_AREA;

    public constructor(private readonly consents: AiConsentDomain) {
        super();
    }

    @AsCompany()
    public async eraseAll(_companyId: string): Promise<number> {
        return this.consents.eraseAll();
    }
}
