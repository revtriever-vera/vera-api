import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { whatsappConfig } from '../config/whatsapp.config';
import { isRecipientAllowed } from '../domain/recipient-allowlist';
import { WhatsAppChannel } from '../domain/whatsapp.types';
import { WhatsAppCloudPort } from '../ports/whatsapp-cloud.port';

@Injectable()
export class WhatsAppDirectReply {
    public constructor(
        private readonly port: WhatsAppCloudPort,
        @Inject(whatsappConfig.KEY) private readonly config: ConfigType<typeof whatsappConfig>
    ) {}

    public async send(channel: WhatsAppChannel, to: string, text: string): Promise<boolean> {
        if (!isRecipientAllowed(this.config.WHATSAPP_ALLOWED_RECIPIENTS, to)) {
            return false;
        }
        try {
            await this.port.sendText(channel, to, text);
            return true;
        } catch {
            return false;
        }
    }

    public async markRead(channel: WhatsAppChannel, wamid: string): Promise<void> {
        try {
            await this.port.markRead(channel, wamid);
        } catch {
            return;
        }
    }
}
