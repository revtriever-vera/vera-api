import { Module } from '@nestjs/common';
import { QueueModule } from '../../../../core/queue/queue.module';
import { WhatsAppChatApplicationModule } from '../../application/whatsapp-chat-application.module';
import { TurnAnsweredHandler } from './answer.handler';
import { ConversationDispatcher } from './conversation.dispatcher';
import { TurnRequestedHandler } from './turn.handler';

@Module({
    imports: [WhatsAppChatApplicationModule, QueueModule],
    providers: [ConversationDispatcher, TurnRequestedHandler, TurnAnsweredHandler]
})
export class WhatsAppChatQueueModule {}
