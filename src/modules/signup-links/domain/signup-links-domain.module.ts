import { Module } from '@nestjs/common';
import { SignupLinksRepositoryModule } from '../repositories/signup-links-repository.module';
import { SignupLinkDomain } from './signup-link.domain';

@Module({
    imports: [SignupLinksRepositoryModule],
    providers: [SignupLinkDomain],
    exports: [SignupLinkDomain]
})
export class SignupLinksDomainModule {}
