import { Injectable } from '@nestjs/common';
import { WhatsAppHealthRepository } from '../repositories/whatsapp-health.repository';
import { ChannelHealth, PhoneHealth } from './whatsapp.types';

@Injectable()
export class ChannelHealthDomain {
    public constructor(private readonly health: WhatsAppHealthRepository) {}

    public async record(channelKey: string, health: PhoneHealth): Promise<void> {
        await this.health.recordHealth(channelKey, health);
    }

    public async markTokenInvalid(channelKey: string): Promise<void> {
        await this.health.markTokenInvalid(channelKey);
    }

    public async isTokenInvalid(channelKey: string): Promise<boolean> {
        const row: ChannelHealth | null = await this.health.find(channelKey);
        return row?.tokenInvalidAt !== null && row?.tokenInvalidAt !== undefined;
    }
}
