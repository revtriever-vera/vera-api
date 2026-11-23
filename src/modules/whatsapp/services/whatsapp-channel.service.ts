import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { AppContext } from '../../../core/context/app-context.port';
import {
    IntegrationCredentialsService,
    TenantWhatsAppCredentials,
    WhatsAppCredentials
} from '../../integration-credentials/services/integration-credentials.service';
import { PlanGateService } from '../../plans/services/plan-gate.service';
import { whatsappConfig } from '../config/whatsapp.config';
import { HOSTED_CHANNEL_KEY, WhatsAppChannel } from '../domain/whatsapp.types';
import { SignatureVerifier } from './signature.verifier';

@Injectable()
export class WhatsAppChannelService {
    public constructor(
        private readonly credentials: IntegrationCredentialsService,
        private readonly gate: PlanGateService,
        private readonly context: AppContext,
        private readonly signature: SignatureVerifier,
        @Inject(whatsappConfig.KEY) private readonly config: ConfigType<typeof whatsappConfig>
    ) {}

    public keyOf(channel: WhatsAppChannel): string {
        return channel.companyId === null ? HOSTED_CHANNEL_KEY : channel.phoneNumberId;
    }

    public isHosted(): boolean {
        return this.gate.mode() === 'hosted';
    }

    public async current(): Promise<WhatsAppChannel | null> {
        if (this.isHosted()) {
            return this.hosted();
        }
        const companyId: string | undefined = this.context.getOrNull()?.companyId;
        if (companyId === undefined) {
            return null;
        }
        const credentials: WhatsAppCredentials | null = await this.credentials.resolve('whatsapp');
        return credentials === null ? null : this.channelOf(credentials, companyId);
    }

    public async byPhoneNumberId(phoneNumberId: string): Promise<WhatsAppChannel | null> {
        if (this.isHosted()) {
            const hosted: WhatsAppChannel | null = await this.hosted();
            return hosted?.phoneNumberId === phoneNumberId ? hosted : null;
        }
        const found: TenantWhatsAppCredentials | null = await this.credentials.findWhatsAppByPhoneNumberIdAcrossTenants(phoneNumberId);
        return found === null ? null : this.channelOf(found.credentials, found.companyId);
    }

    public async byVerifyToken(verifyToken: string): Promise<WhatsAppChannel | null> {
        const candidates: WhatsAppChannel[] = await this.listAll();
        return candidates.find((channel: WhatsAppChannel): boolean => this.signature.safeEqual(channel.verifyToken, verifyToken)) ?? null;
    }

    public async byKey(channelKey: string): Promise<WhatsAppChannel | null> {
        if (channelKey === HOSTED_CHANNEL_KEY) {
            return this.hosted();
        }
        return this.byPhoneNumberId(channelKey);
    }

    public async listAll(): Promise<WhatsAppChannel[]> {
        if (this.isHosted()) {
            const hosted: WhatsAppChannel | null = await this.hosted();
            return hosted === null ? [] : [hosted];
        }
        const all: TenantWhatsAppCredentials[] = await this.credentials.listWhatsAppAcrossTenants();
        return all.map((entry: TenantWhatsAppCredentials): WhatsAppChannel => this.channelOf(entry.credentials, entry.companyId));
    }

    private async hosted(): Promise<WhatsAppChannel | null> {
        const credentials: WhatsAppCredentials | null = await this.credentials.resolve('whatsapp');
        return credentials === null ? null : this.channelOf(credentials, null);
    }

    private channelOf(credentials: WhatsAppCredentials, companyId: string | null): WhatsAppChannel {
        return {
            phoneNumberId: credentials.phoneNumberId,
            wabaId: credentials.wabaId,
            accessToken: credentials.accessToken,
            appSecret: credentials.appSecret,
            verifyToken: credentials.verifyToken,
            displayNumber: companyId === null ? this.config.WHATSAPP_DISPLAY_NUMBER : null,
            companyId
        };
    }
}
