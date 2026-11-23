import { Module } from '@nestjs/common';
import { WhatsAppCommandModule } from './access/commands/whatsapp-command.module';
import { WhatsAppHttpModule } from './access/http/whatsapp-http.module';
import { WhatsAppQueueModule } from './access/queue/whatsapp-queue.module';

@Module({
    imports: [WhatsAppHttpModule, WhatsAppCommandModule, WhatsAppQueueModule]
})
export class WhatsAppModule {}
