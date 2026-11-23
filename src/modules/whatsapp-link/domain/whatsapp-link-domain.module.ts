import { Module } from '@nestjs/common';
import { WhatsAppLinkRepositoryModule } from '../repositories/whatsapp-link-repository.module';
import { LinkCodeDomain } from './link-code.domain';
import { LinkDomain } from './link.domain';

@Module({
    imports: [WhatsAppLinkRepositoryModule],
    providers: [LinkDomain, LinkCodeDomain],
    exports: [LinkDomain, LinkCodeDomain]
})
export class WhatsAppLinkDomainModule {}
