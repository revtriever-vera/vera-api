import { Module } from '@nestjs/common';
import { WhatsAppApplicationModule } from '../../application/whatsapp-application.module';
import { HealthCommand, HealthTickHandler } from './health.command';
import { RetentionCommand, RetentionTickHandler } from './retention.command';
import { TemplatesSyncCommand, TemplatesSyncTickHandler } from './templates-sync.command';

@Module({
    imports: [WhatsAppApplicationModule],
    providers: [TemplatesSyncCommand, TemplatesSyncTickHandler, HealthCommand, HealthTickHandler, RetentionCommand, RetentionTickHandler]
})
export class WhatsAppCommandModule {}
