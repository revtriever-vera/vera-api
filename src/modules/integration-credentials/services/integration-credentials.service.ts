import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { AsCompany } from '../../../core/context/as-company.decorator';
import { PlanGateService } from '../../plans/services/plan-gate.service';
import { integrationCredentialsConfig } from '../config/integration-credentials.config';
import { IntegrationCredentialsDomain } from '../domain/integration-credentials.domain';
import { IntegrationUnreadableError } from '../domain/integration-credentials.errors';
import {
    IntegrationCredential,
    IntegrationCredentialsByKind,
    IntegrationKind,
    TenantWhatsAppCredentials
} from '../domain/integration.types';
import { InstanceCredentialsService } from './instance-credentials.service';
import { IntegrationVaultService } from './integration-vault.service';
import { IntegrationsLogService } from './integrations-log.service';

export type { GoogleCredentials, TenantWhatsAppCredentials, WhatsAppCredentials } from '../domain/integration.types';

@Injectable()
export class IntegrationCredentialsService {
    public constructor(
        private readonly credentials: IntegrationCredentialsDomain,
        private readonly vault: IntegrationVaultService,
        private readonly instance: InstanceCredentialsService,
        private readonly gate: PlanGateService,
        private readonly logs: IntegrationsLogService,
        @Inject(integrationCredentialsConfig.KEY) private readonly config: ConfigType<typeof integrationCredentialsConfig>
    ) {}

    public async resolve<K extends IntegrationKind>(kind: K): Promise<IntegrationCredentialsByKind[K] | null> {
        if (this.gate.mode() === 'hosted') {
            return this.instance.of(kind, 'gateway');
        }
        const row: IntegrationCredential | null = await this.credentials.find(kind);
        if (row !== null) {
            return this.openOrNull(kind, row);
        }
        return this.config.INTEGRATIONS_INSTANCE_FALLBACK ? this.instance.of(kind, 'openai_compatible') : null;
    }

    public async has(kind: IntegrationKind): Promise<boolean> {
        if (this.gate.mode() === 'hosted') {
            return this.instance.of(kind, 'gateway') !== null;
        }
        if ((await this.credentials.find(kind)) !== null) {
            return true;
        }
        return this.config.INTEGRATIONS_INSTANCE_FALLBACK && this.instance.of(kind, 'openai_compatible') !== null;
    }

    public async findWhatsAppByPhoneNumberIdAcrossTenants(phoneNumberId: string): Promise<TenantWhatsAppCredentials | null> {
        const companyId: string | null = await this.credentials.findCompanyByPhoneNumberIdAcrossTenants(phoneNumberId);
        return companyId === null ? null : this.whatsAppOf(companyId);
    }

    public async listWhatsAppAcrossTenants(): Promise<TenantWhatsAppCredentials[]> {
        const companyIds: string[] = await this.credentials.listCompanyIdsByKind('whatsapp');
        const found: (TenantWhatsAppCredentials | null)[] = [];
        for (const companyId of companyIds) {
            found.push(await this.whatsAppOf(companyId));
        }
        return found.filter((entry: TenantWhatsAppCredentials | null): entry is TenantWhatsAppCredentials => entry !== null);
    }

    @AsCompany()
    private async whatsAppOf(companyId: string): Promise<TenantWhatsAppCredentials | null> {
        const row: IntegrationCredential | null = await this.credentials.find('whatsapp');
        const credentials: IntegrationCredentialsByKind['whatsapp'] | null = row === null ? null : await this.openOrNull('whatsapp', row);
        return credentials === null ? null : { companyId, credentials };
    }

    private async openOrNull<K extends IntegrationKind>(
        kind: K,
        row: IntegrationCredential
    ): Promise<IntegrationCredentialsByKind[K] | null> {
        try {
            return await this.vault.open(kind, row);
        } catch (error: unknown) {
            if (!(error instanceof IntegrationUnreadableError)) {
                throw error;
            }
            this.logs.unreadable(kind);
            return null;
        }
    }
}
