import { Module } from '@nestjs/common';
import { WhatsAppLinkApplicationModule } from '../../application/whatsapp-link-application.module';
import { WhatsAppLinksStaleCommand, WhatsAppLinksStaleTickHandler } from './links-stale.command';

@Module({
    imports: [WhatsAppLinkApplicationModule],
    providers: [WhatsAppLinksStaleCommand, WhatsAppLinksStaleTickHandler]
})
export class WhatsAppLinkCommandModule {}
