import { Module } from '@nestjs/common';
import { ContextModule } from '../../../core/context/context.module';
import { DatabaseModule } from '../../../core/database/database.module';
import { WhatsAppLinkCodesRepository } from './whatsapp-link-codes.repository';
import { WhatsAppLinksRepository } from './whatsapp-links.repository';

@Module({
    imports: [DatabaseModule, ContextModule],
    providers: [WhatsAppLinksRepository, WhatsAppLinkCodesRepository],
    exports: [WhatsAppLinksRepository, WhatsAppLinkCodesRepository]
})
export class WhatsAppLinkRepositoryModule {}
