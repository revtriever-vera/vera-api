import { Module } from '@nestjs/common';
import { AssistantChatCommandModule } from './access/commands/assistant-chat-command.module';
import { AssistantChatHttpModule } from './access/http/assistant-chat-http.module';
import { AssistantChatQueueModule } from './access/queue/assistant-chat-queue.module';

@Module({
    imports: [AssistantChatHttpModule, AssistantChatQueueModule, AssistantChatCommandModule]
})
export class AssistantChatModule {}
