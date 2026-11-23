import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { integrationCredentialsConfig } from '../../config/integration-credentials.config';
import { IntegrationTestFailedError } from '../../domain/integration-credentials.errors';
import { IntegrationCredentialsByKind } from '../../domain/integration.types';
import { probe, reasonOf } from './tester-http';

const FIELDS: string = 'display_phone_number,verified_name';

@Injectable()
export class WhatsAppTester {
    public constructor(
        @Inject(integrationCredentialsConfig.KEY) private readonly config: ConfigType<typeof integrationCredentialsConfig>
    ) {}

    public async test(credentials: IntegrationCredentialsByKind['whatsapp']): Promise<void> {
        const response: Response = await probe(
            `${this.config.WHATSAPP_GRAPH_URL}/${encodeURIComponent(credentials.phoneNumberId)}?fields=${FIELDS}`,
            { method: 'GET', headers: { accept: 'application/json', authorization: `Bearer ${credentials.accessToken}` } },
            this.config.INTEGRATIONS_TEST_TIMEOUT_MS
        );
        await response.body?.cancel();
        if (!response.ok) {
            throw new IntegrationTestFailedError(reasonOf(response.status));
        }
    }
}
