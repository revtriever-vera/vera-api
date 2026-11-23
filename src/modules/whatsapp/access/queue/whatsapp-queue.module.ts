import { Module } from '@nestjs/common';
import { QueueModule } from '../../../../core/queue/queue.module';
import { WhatsAppApplicationModule } from '../../application/whatsapp-application.module';
import { InboundMessageHandler } from './inbound.handler';
import { MessageSendHandler } from './send.handler';
import { MessageStatusHandler } from './status.handler';
import { WebhookReceivedHandler } from './webhook.handler';

@Module({
    imports: [WhatsAppApplicationModule, QueueModule],
    providers: [WebhookReceivedHandler, InboundMessageHandler, MessageStatusHandler, MessageSendHandler]
})
export class WhatsAppQueueModule {}
