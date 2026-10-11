import { Module } from '@nestjs/common';
import { IdentityRepositoryModule } from '../repositories/identity-repository.module';
import { AuthIdentityDomain } from './auth-identity.domain';
import { CompanyDomain } from './company.domain';
import { SessionDomain } from './session.domain';
import { UserDomain } from './user.domain';

@Module({
    imports: [IdentityRepositoryModule],
    providers: [CompanyDomain, UserDomain, SessionDomain, AuthIdentityDomain],
    exports: [CompanyDomain, UserDomain, SessionDomain, AuthIdentityDomain]
})
export class IdentityDomainModule {}
