import { Module } from '@nestjs/common';
import { WhatsAppLinkApplicationModule } from '../../application/whatsapp-link-application.module';
import { LinkInboundDispatcher } from './link-inbound.dispatcher';

@Module({
    imports: [WhatsAppLinkApplicationModule],
    providers: [LinkInboundDispatcher]
})
export class WhatsAppLinkQueueModule {}
