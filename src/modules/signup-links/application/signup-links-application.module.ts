import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ContextModule } from '../../../core/context/context.module';
import { IdentityApplicationModule } from '../../identity/application/identity-application.module';
import { signupLinksConfig } from '../config/signup-links.config';
import { SignupLinksDomainModule } from '../domain/signup-links-domain.module';
import { SignupLinkViewMapper } from '../services/signup-link-view.mapper';
import { SignupLinksAdminApplication } from './signup-links-admin.application';
import { SignupLinksPublicApplication } from './signup-links-public.application';

@Module({
    imports: [ConfigModule.forFeature(signupLinksConfig), SignupLinksDomainModule, IdentityApplicationModule, ContextModule],
    providers: [SignupLinksAdminApplication, SignupLinksPublicApplication, SignupLinkViewMapper],
    exports: [SignupLinksAdminApplication, SignupLinksPublicApplication]
})
export class SignupLinksApplicationModule {}
