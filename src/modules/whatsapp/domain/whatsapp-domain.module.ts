import { Module } from '@nestjs/common';
import { WhatsAppRepositoryModule } from '../repositories/whatsapp-repository.module';
import { ChannelHealthDomain } from './channel-health.domain';
import { TemplateRegistrationDomain } from './template-registration.domain';
import { WebhookEventDomain } from './webhook-event.domain';
import { WhatsAppMessageDomain } from './whatsapp-message.domain';

@Module({
    imports: [WhatsAppRepositoryModule],
    providers: [WebhookEventDomain, WhatsAppMessageDomain, TemplateRegistrationDomain, ChannelHealthDomain],
    exports: [WebhookEventDomain, WhatsAppMessageDomain, TemplateRegistrationDomain, ChannelHealthDomain]
})
export class WhatsAppDomainModule {}
