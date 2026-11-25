import { Module } from '@nestjs/common';
import { QueueModule } from '../../../../core/queue/queue.module';
import { AssistantChatApplicationModule } from '../../application/assistant-chat-application.module';
import { AssistantTurnRequestedHandler } from './assistant-turn.handler';

@Module({
    imports: [AssistantChatApplicationModule, QueueModule],
    providers: [AssistantTurnRequestedHandler]
})
export class AssistantChatQueueModule {}
