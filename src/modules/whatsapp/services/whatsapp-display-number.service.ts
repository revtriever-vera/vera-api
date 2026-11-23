import { Injectable } from '@nestjs/common';
import { WhatsAppChannel } from '../domain/whatsapp.types';
import { WhatsAppProviderDisabledError } from '../domain/whatsapp.errors';
import { WhatsAppCloudPort } from '../ports/whatsapp-cloud.port';

@Injectable()
export class WhatsAppDisplayNumber {
    public constructor(private readonly port: WhatsAppCloudPort) {}

    public async digitsOf(channel: WhatsAppChannel): Promise<string> {
        const shown: string | null = channel.displayNumber ?? (await this.fetch(channel));
        const digits: string = (shown ?? '').replaceAll(/\D/g, '');
        if (digits.length === 0) {
            throw new WhatsAppProviderDisabledError();
        }
        return digits;
    }

    private async fetch(channel: WhatsAppChannel): Promise<string | null> {
        try {
            return await this.port.displayNumber(channel);
        } catch {
            return null;
        }
    }
}
