import { Injectable } from '@nestjs/common';
import { DatabaseClient } from '../../../core/database/database.client';
import { BareGlobalRepository } from '../../../core/database/repositories/bare-global.repository';
import { ChannelHealth, PhoneHealth } from '../domain/whatsapp.types';

@Injectable()
export class WhatsAppHealthRepository extends BareGlobalRepository<'WhatsAppHealth'> {
    public constructor(database: DatabaseClient) {
        super(database, 'WhatsAppHealth');
    }

    public async find(channelKey: string): Promise<ChannelHealth | null> {
        return this.findOne({ channelKey });
    }

    public async recordHealth(channelKey: string, health: PhoneHealth): Promise<void> {
        const values: Omit<ChannelHealth, 'tokenInvalidAt' | 'checkedAt'> = {
            channelKey,
            qualityRating: health.qualityRating,
            messagingLimitTier: health.messagingLimitTier,
            status: health.status
        };
        await this.upsertRow(values, { columns: ['channelKey'], update: { ...values, tokenInvalidAt: null, checkedAt: new Date() } });
    }

    public async markTokenInvalid(channelKey: string): Promise<void> {
        const now: Date = new Date();
        await this.upsertRow({ channelKey, tokenInvalidAt: now }, { columns: ['channelKey'], update: { tokenInvalidAt: now } });
    }
}
