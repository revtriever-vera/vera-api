import { Module } from '@nestjs/common';
import { IdentityRepositoryModule } from '../repositories/identity-repository.module';
import { CompanyDomain } from './company.domain';
import { SessionDomain } from './session.domain';
import { UserDomain } from './user.domain';

@Module({
    imports: [IdentityRepositoryModule],
    providers: [CompanyDomain, UserDomain, SessionDomain],
    exports: [CompanyDomain, UserDomain, SessionDomain]
})
export class IdentityDomainModule {}
