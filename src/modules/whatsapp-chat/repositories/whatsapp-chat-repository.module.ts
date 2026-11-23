import { Module } from '@nestjs/common';
import { ContextModule } from '../../../core/context/context.module';
import { DatabaseModule } from '../../../core/database/database.module';
import { WhatsAppPendingActionsRepository } from './whatsapp-pending-actions.repository';

@Module({
    imports: [DatabaseModule, ContextModule],
    providers: [WhatsAppPendingActionsRepository],
    exports: [WhatsAppPendingActionsRepository]
})
export class WhatsAppChatRepositoryModule {}
