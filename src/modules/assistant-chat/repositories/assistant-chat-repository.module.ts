import { Module } from '@nestjs/common';
import { ContextModule } from '../../../core/context/context.module';
import { DatabaseModule } from '../../../core/database/database.module';
import { AssistantConversationsRepository } from './assistant-conversations.repository';
import { AssistantMessagesRepository } from './assistant-messages.repository';
import { AssistantPendingActionsRepository } from './assistant-pending-actions.repository';

@Module({
    imports: [DatabaseModule, ContextModule],
    providers: [AssistantConversationsRepository, AssistantMessagesRepository, AssistantPendingActionsRepository],
    exports: [AssistantConversationsRepository, AssistantMessagesRepository, AssistantPendingActionsRepository]
})
export class AssistantChatRepositoryModule {}
