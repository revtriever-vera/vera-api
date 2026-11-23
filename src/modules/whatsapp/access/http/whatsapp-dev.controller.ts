import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Post } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { SendApplication } from '../../application/send.application';
import { WebhookApplication } from '../../application/webhook.application';
import { whatsappConfig } from '../../config/whatsapp.config';
import { WhatsAppDevRouteDisabledError } from '../../domain/whatsapp.errors';
import type { MockSentMessage } from '../../services/mock-outbox.service';
import { DevInboundBodyDto } from '../../validation/whatsapp-webhook.schemas';

@ApiExcludeController()
@Controller('whatsapp/_dev')
export class WhatsAppDevController {
    public constructor(
        private readonly webhook: WebhookApplication,
        private readonly send: SendApplication,
        @Inject(whatsappConfig.KEY) private readonly config: ConfigType<typeof whatsappConfig>
    ) {}

    @Get('messages')
    public messages(): { items: readonly MockSentMessage[] } {
        this.assertEnabled();
        return { items: this.send.devOutbox() };
    }

    @Post('inbound')
    @HttpCode(HttpStatus.ACCEPTED)
    public async inbound(@Body() body: DevInboundBodyDto): Promise<void> {
        this.assertEnabled();
        await this.webhook.simulateInbound(body);
    }

    private assertEnabled(): void {
        if (!this.config.WHATSAPP_DEV_ROUTES) {
            throw new WhatsAppDevRouteDisabledError();
        }
    }
}
