import { Injectable } from '@nestjs/common';
import { AuthIdentitiesRepository } from '../repositories/auth-identities.repository';
import { AuthIdentity, SocialIdentity } from './identity.types';

@Injectable()
export class AuthIdentityDomain {
    public constructor(private readonly identities: AuthIdentitiesRepository) {}

    public async link(userId: string, identity: SocialIdentity): Promise<AuthIdentity> {
        return this.identities.create({
            userId,
            provider: identity.provider,
            subject: identity.subject,
            email: identity.email,
            emailVerified: identity.emailVerified,
            lastLoginAt: new Date()
        });
    }

    public async findByProviderSubjectAcrossTenants(provider: string, subject: string): Promise<AuthIdentity | null> {
        return this.identities.findByProviderSubjectAcrossTenants(provider, subject);
    }

    public async touchLogin(identityId: string): Promise<void> {
        await this.identities.touchLogin(identityId, new Date());
    }
}
