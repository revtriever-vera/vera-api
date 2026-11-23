import { Module } from '@nestjs/common';
import { IdentityRepositoryModule } from '../repositories/identity-repository.module';
import { AccountDeletionLogDomain } from './account-deletion-log.domain';
import { AuthIdentityDomain } from './auth-identity.domain';
import { CompanyDomain } from './company.domain';
import { SessionDomain } from './session.domain';
import { InviteDomain } from './invite.domain';
import { PlatformAuditDomain } from './platform-audit.domain';
import { UserDomain } from './user.domain';

@Module({
    imports: [IdentityRepositoryModule],
    providers: [CompanyDomain, UserDomain, SessionDomain, AuthIdentityDomain, AccountDeletionLogDomain, InviteDomain, PlatformAuditDomain],
    exports: [CompanyDomain, UserDomain, SessionDomain, AuthIdentityDomain, AccountDeletionLogDomain, InviteDomain, PlatformAuditDomain]
})
export class IdentityDomainModule {}
