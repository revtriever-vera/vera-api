import { Module } from '@nestjs/common';
import { ContextModule } from '../../../core/context/context.module';
import { DatabaseModule } from '../../../core/database/database.module';
import { AssistantConversationsRepository } from './assistant-conversations.repository';
import { AssistantMessagesRepository } from './assistant-messages.repository';

@Module({
    imports: [DatabaseModule, ContextModule],
    providers: [AssistantConversationsRepository, AssistantMessagesRepository],
    exports: [AssistantConversationsRepository, AssistantMessagesRepository]
})
export class AssistantChatRepositoryModule {}
