import { Module } from '@nestjs/common';
import { ContextModule } from '../../../core/context/context.module';
import { DatabaseModule } from '../../../core/database/database.module';
import { WhatsAppHealthRepository } from './whatsapp-health.repository';
import { WhatsAppMessagesRepository } from './whatsapp-messages.repository';
import { WhatsAppTemplateRegistrationsRepository } from './whatsapp-template-registrations.repository';
import { WhatsAppWebhookEventsRepository } from './whatsapp-webhook-events.repository';

@Module({
    imports: [DatabaseModule, ContextModule],
    providers: [
        WhatsAppWebhookEventsRepository,
        WhatsAppMessagesRepository,
        WhatsAppTemplateRegistrationsRepository,
        WhatsAppHealthRepository
    ],
    exports: [
        WhatsAppWebhookEventsRepository,
        WhatsAppMessagesRepository,
        WhatsAppTemplateRegistrationsRepository,
        WhatsAppHealthRepository
    ]
})
export class WhatsAppRepositoryModule {}
