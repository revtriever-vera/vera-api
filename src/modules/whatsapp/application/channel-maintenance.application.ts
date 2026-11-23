import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { whatsappConfig } from '../config/whatsapp.config';
import { ChannelHealthDomain } from '../domain/channel-health.domain';
import {
    TEMPLATE_STATUSES,
    PhoneHealth,
    RemoteTemplate,
    TemplateDefinition,
    TemplateStatus,
    WhatsAppChannel
} from '../domain/whatsapp.types';
import { catalogDefinitions, versionOf } from '../domain/template-catalog';
import { TemplateRegistrationDomain } from '../domain/template-registration.domain';
import { WhatsAppCloudPort, WhatsAppGraphError } from '../ports/whatsapp-cloud.port';
import { WhatsAppChannelService } from '../services/whatsapp-channel.service';
import { WhatsAppHousekeepingService } from '../services/whatsapp-housekeeping.service';
import { WhatsAppLogService } from '../services/whatsapp-log.service';
import { WhatsAppMetricsService } from '../services/whatsapp-metrics.service';

const REMOTE_TO_LOCAL: Readonly<Record<string, TemplateStatus>> = {
    APPROVED: TEMPLATE_STATUSES.approved,
    PENDING: TEMPLATE_STATUSES.submitted,
    IN_APPEAL: TEMPLATE_STATUSES.submitted,
    REJECTED: TEMPLATE_STATUSES.rejected,
    PAUSED: TEMPLATE_STATUSES.paused,
    DISABLED: TEMPLATE_STATUSES.paused
};
const QUALITY_RANK: Readonly<Record<string, number>> = { RED: 0, YELLOW: 1, GREEN: 2 };

function remoteKey(name: string, language: string): string {
    return `${name}:${language}`;
}

function worstOf(ratings: readonly string[]): string | null {
    const ranked: string[] = ratings.filter((rating: string): boolean => rating in QUALITY_RANK);
    return ranked.toSorted((a: string, b: string): number => (QUALITY_RANK[a] ?? 0) - (QUALITY_RANK[b] ?? 0))[0] ?? null;
}

@Injectable()
export class ChannelMaintenanceApplication {
    public constructor(
        private readonly channels: WhatsAppChannelService,
        private readonly registrations: TemplateRegistrationDomain,
        private readonly health: ChannelHealthDomain,
        private readonly housekeeping: WhatsAppHousekeepingService,
        private readonly port: WhatsAppCloudPort,
        private readonly logs: WhatsAppLogService,
        private readonly metrics: WhatsAppMetricsService,
        @Inject(whatsappConfig.KEY) private readonly config: ConfigType<typeof whatsappConfig>
    ) {}

    public async syncTemplates(): Promise<void> {
        for (const channel of await this.channels.listAll()) {
            await this.syncChannel(channel);
        }
    }

    public async checkHealth(): Promise<void> {
        const ratings: Record<'hosted' | 'self_hosted', string[]> = { hosted: [], self_hosted: [] };
        for (const channel of await this.channels.listAll()) {
            const rating: string | null = await this.healthOf(channel);
            if (rating !== null) {
                ratings[channel.companyId === null ? 'hosted' : 'self_hosted'].push(rating);
            }
        }
        for (const group of ['hosted', 'self_hosted'] as const) {
            const worst: string | null = worstOf(ratings[group]);
            if (worst !== null) {
                this.metrics.quality(group, worst);
            }
        }
        const age: number | null = await this.housekeeping.lastWebhookAgeSeconds();
        if (age !== null) {
            this.metrics.lastWebhookAge(age);
        }
    }

    public async purge(): Promise<void> {
        await this.housekeeping.purge();
    }

    private async syncChannel(channel: WhatsAppChannel): Promise<void> {
        if (channel.wabaId === null) {
            this.logs.channelSkipped('waba_missing');
            return;
        }
        const key: string = this.channels.keyOf(channel);
        try {
            const remote: ReadonlyMap<string, RemoteTemplate> = new Map(
                (await this.port.listTemplates(channel)).map((entry: RemoteTemplate): [string, RemoteTemplate] => [
                    remoteKey(entry.name, entry.language),
                    entry
                ])
            );
            for (const definition of catalogDefinitions()) {
                await this.syncDefinition(channel, key, definition, remote.get(remoteKey(definition.name, definition.language)));
            }
        } catch (error: unknown) {
            await this.onChannelFailure(key, error);
        }
    }

    private async syncDefinition(
        channel: WhatsAppChannel,
        key: string,
        definition: TemplateDefinition,
        remote: RemoteTemplate | undefined
    ): Promise<void> {
        if (remote !== undefined) {
            const status: TemplateStatus = REMOTE_TO_LOCAL[remote.status] ?? TEMPLATE_STATUSES.submitted;
            await this.save(key, definition, status, remote.remoteId, remote.rejectedReason);
            return;
        }
        if (this.config.WHATSAPP_TEMPLATES_AUTO_SUBMIT) {
            const submitted: { readonly remoteId: string } = await this.port.submitTemplate(channel, definition);
            await this.save(key, definition, TEMPLATE_STATUSES.submitted, submitted.remoteId, null);
        }
    }

    private async save(
        key: string,
        definition: TemplateDefinition,
        status: TemplateStatus,
        remoteId: string,
        rejectedReason: string | null
    ): Promise<void> {
        await this.registrations.save({
            channelKey: key,
            name: definition.name,
            language: definition.language,
            version: versionOf(definition.name),
            status,
            remoteId,
            rejectedReason
        });
        this.logs.templateStatus(definition.name, definition.language, status);
    }

    private async onChannelFailure(key: string, error: unknown): Promise<void> {
        const failure: WhatsAppGraphError | null = error instanceof WhatsAppGraphError ? error : null;
        if (failure?.kind === 'token_invalid') {
            await this.health.markTokenInvalid(key);
            this.logs.tokenInvalid(key);
            return;
        }
        this.logs.syncFailed(key, failure?.errorCode ?? 'unexpected');
    }

    private async healthOf(channel: WhatsAppChannel): Promise<string | null> {
        const key: string = this.channels.keyOf(channel);
        try {
            const health: PhoneHealth = await this.port.phoneHealth(channel);
            await this.health.record(key, health);
            this.logs.quality(key, health.qualityRating, health.messagingLimitTier);
            return health.qualityRating;
        } catch (error: unknown) {
            await this.onHealthFailure(key, error);
            return null;
        }
    }

    private async onHealthFailure(key: string, error: unknown): Promise<void> {
        const failure: WhatsAppGraphError | null = error instanceof WhatsAppGraphError ? error : null;
        if (failure?.kind === 'token_invalid') {
            await this.health.markTokenInvalid(key);
            this.logs.tokenInvalid(key);
            return;
        }
        this.logs.healthFailed(key, failure?.errorCode ?? 'unexpected');
    }
}
