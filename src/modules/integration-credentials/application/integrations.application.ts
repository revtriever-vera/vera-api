import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { UsingTransaction } from '../../../core/database/using-transaction.decorator';
import { PlanGateService } from '../../plans/services/plan-gate.service';
import { integrationCredentialsConfig } from '../config/integration-credentials.config';
import { IntegrationCredentialsDomain } from '../domain/integration-credentials.domain';
import { IntegrationTestFailedError, IntegrationsUnavailableError } from '../domain/integration-credentials.errors';
import {
    INTEGRATION_KINDS,
    IntegrationCredential,
    IntegrationCredentialsByKind,
    IntegrationItem,
    IntegrationKind,
    IntegrationsView,
    KindCount,
    SealedIntegration
} from '../domain/integration.types';
import { toIntegrationItem } from '../domain/integration.mapper';
import { IntegrationRemovedRegistry } from '../services/integration-removed.registry';
import { IntegrationTesterService } from '../services/integration-tester.service';
import { IntegrationVaultService } from '../services/integration-vault.service';
import { IntegrationsLogService } from '../services/integrations-log.service';
import { IntegrationsMetricsService } from '../services/integrations-metrics.service';
import { SaveGoogleBody, SaveLlmBody, SaveWhatsAppBody } from '../validation/integrations.schemas';

const GOOGLE_CALLBACK_PATH: string = '/api/google/callback';
const WHATSAPP_WEBHOOK_PATH: string = '/api/whatsapp/webhook';

@Injectable()
export class IntegrationsApplication {
    public constructor(
        private readonly credentials: IntegrationCredentialsDomain,
        private readonly vault: IntegrationVaultService,
        private readonly gate: PlanGateService,
        private readonly testers: IntegrationTesterService,
        private readonly removed: IntegrationRemovedRegistry,
        private readonly logs: IntegrationsLogService,
        private readonly metrics: IntegrationsMetricsService,
        @Inject(integrationCredentialsConfig.KEY) private readonly config: ConfigType<typeof integrationCredentialsConfig>
    ) {}

    public async list(): Promise<IntegrationsView> {
        this.assertSelfHosted();
        const rows: IntegrationCredential[] = await this.credentials.list();
        return {
            items: INTEGRATION_KINDS.map((kind: IntegrationKind): IntegrationItem => toIntegrationItem(kind, rows)),
            webhookUrl: `${this.config.PUBLIC_API_URL}${WHATSAPP_WEBHOOK_PATH}`,
            googleRedirectUri: `${this.config.PUBLIC_API_URL}${GOOGLE_CALLBACK_PATH}`
        };
    }

    public async saveLlm(body: SaveLlmBody): Promise<IntegrationItem> {
        this.assertSelfHosted();
        const credentials: IntegrationCredentialsByKind['llm'] = { kind: 'llm', provider: 'openai_compatible', ...body };
        await this.verify('llm', async () => this.testers.llm(credentials));
        return this.persist('llm', credentials);
    }

    public async saveWhatsApp(body: SaveWhatsAppBody): Promise<IntegrationItem> {
        this.assertSelfHosted();
        const credentials: IntegrationCredentialsByKind['whatsapp'] = { kind: 'whatsapp', wabaId: null, ...body };
        await this.verify('whatsapp', async () => this.testers.whatsApp(credentials));
        return this.persist('whatsapp', credentials);
    }

    public async saveGoogle(body: SaveGoogleBody): Promise<IntegrationItem> {
        this.assertSelfHosted();
        this.metrics.tested('google', 'ok');
        return this.persist('google', { kind: 'google', ...body });
    }

    public async remove(kind: IntegrationKind): Promise<void> {
        this.assertSelfHosted();
        await this.erase(kind);
        this.logs.removed(kind);
        await this.refreshGauge();
    }

    private async persist<K extends IntegrationKind>(kind: K, credentials: IntegrationCredentialsByKind[K]): Promise<IntegrationItem> {
        const sealed: SealedIntegration = await this.vault.seal(kind, credentials);
        const row: IntegrationCredential = await this.store(sealed);
        this.logs.saved(kind);
        await this.refreshGauge();
        return toIntegrationItem(kind, [row]);
    }

    @UsingTransaction()
    private async store(sealed: SealedIntegration): Promise<IntegrationCredential> {
        return this.credentials.replace(sealed);
    }

    @UsingTransaction()
    private async erase(kind: IntegrationKind): Promise<void> {
        await this.credentials.remove(kind);
        await this.removed.notify(kind);
    }

    private async verify(kind: IntegrationKind, run: () => Promise<void>): Promise<void> {
        try {
            await run();
        } catch (error: unknown) {
            if (error instanceof IntegrationTestFailedError) {
                this.logs.testFailed(kind, error.reason);
                this.metrics.tested(kind, error.reason);
            }
            throw error;
        }
        this.metrics.tested(kind, 'ok');
    }

    private async refreshGauge(): Promise<void> {
        const counts: KindCount[] = await this.credentials.countByKind();
        const totals: Map<string, number> = new Map(counts.map((count: KindCount): [string, number] => [count.kind, count.total]));
        for (const kind of INTEGRATION_KINDS) {
            this.metrics.configured(kind, totals.get(kind) ?? 0);
        }
    }

    private assertSelfHosted(): void {
        if (this.gate.mode() !== 'self_hosted') {
            throw new IntegrationsUnavailableError();
        }
    }
}
