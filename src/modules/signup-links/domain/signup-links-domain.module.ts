import { Module } from '@nestjs/common';
import { SignupLinksRepositoryModule } from '../repositories/signup-links-repository.module';
import { SignupEmailMarkDomain } from './signup-email-mark.domain';
import { SignupLinkDomain } from './signup-link.domain';
import { SignupRedemptionDomain } from './signup-redemption.domain';

@Module({
    imports: [SignupLinksRepositoryModule],
    providers: [SignupLinkDomain, SignupRedemptionDomain, SignupEmailMarkDomain],
    exports: [SignupLinkDomain, SignupRedemptionDomain, SignupEmailMarkDomain]
})
export class SignupLinksDomainModule {}
