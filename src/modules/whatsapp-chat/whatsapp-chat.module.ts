import { Module } from '@nestjs/common';
import { WhatsAppChatQueueModule } from './access/queue/whatsapp-chat-queue.module';

@Module({
    imports: [WhatsAppChatQueueModule]
})
export class WhatsAppChatModule {}
