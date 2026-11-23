import { Injectable } from '@nestjs/common';
import { IntegrationCredentialsService } from '../../integration-credentials/services/integration-credentials.service';
import { PaidFeatureAvailabilityPort } from '../../plans/services/paid-feature-availability.port';
import { ChannelHealthDomain } from '../domain/channel-health.domain';
import { WhatsAppChannel } from '../domain/whatsapp.types';
import { WhatsAppChannelService } from './whatsapp-channel.service';

@Injectable()
export class WhatsAppAvailability extends PaidFeatureAvailabilityPort {
    public readonly feature: PaidFeatureAvailabilityPort['feature'] = 'whatsapp';

    public constructor(
        private readonly channels: WhatsAppChannelService,
        private readonly health: ChannelHealthDomain,
        private readonly credentials: IntegrationCredentialsService
    ) {
        super();
    }

    public async enabled(): Promise<boolean> {
        const channel: WhatsAppChannel | null = await this.channels.current();
        if (channel === null) {
            return false;
        }
        if (await this.health.isTokenInvalid(this.channels.keyOf(channel))) {
            return false;
        }
        return this.channels.isHosted() || (await this.credentials.has('llm'));
    }
}
