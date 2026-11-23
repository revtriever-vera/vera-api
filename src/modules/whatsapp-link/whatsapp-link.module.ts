import { Module } from '@nestjs/common';
import { WhatsAppLinkCommandModule } from './access/commands/whatsapp-link-command.module';
import { WhatsAppLinkHttpModule } from './access/http/whatsapp-link-http.module';
import { WhatsAppLinkQueueModule } from './access/queue/whatsapp-link-queue.module';

@Module({
    imports: [WhatsAppLinkHttpModule, WhatsAppLinkCommandModule, WhatsAppLinkQueueModule]
})
export class WhatsAppLinkModule {}
