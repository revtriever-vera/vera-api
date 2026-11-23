import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WhatsAppApplicationModule } from '../../application/whatsapp-application.module';
import { whatsappConfig } from '../../config/whatsapp.config';
import { WebhookController } from './webhook.controller';
import { WhatsAppDevController } from './whatsapp-dev.controller';

@Module({
    imports: [WhatsAppApplicationModule, ConfigModule.forFeature(whatsappConfig)],
    controllers: [WebhookController, WhatsAppDevController]
})
export class WhatsAppHttpModule {}
