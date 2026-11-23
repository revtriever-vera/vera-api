import { Injectable } from '@nestjs/common';
import { AiConsentsRepository } from '../repositories/ai-consents.repository';
import { AiConsent, GrantInput } from './ai-assistant.types';

@Injectable()
export class AiConsentDomain {
    public constructor(private readonly consents: AiConsentsRepository) {}

    public async current(): Promise<AiConsent | null> {
        return this.consents.current();
    }

    public async grant(input: GrantInput): Promise<AiConsent> {
        return this.consents.grant(input);
    }

    public async revoke(userId: string | null): Promise<boolean> {
        const revoked: number = await this.consents.revoke(userId);
        return revoked > 0;
    }

    public async eraseAll(): Promise<number> {
        return this.consents.eraseAll();
    }
}
