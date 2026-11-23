import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { integrationCredentialsConfig } from '../../config/integration-credentials.config';
import { IntegrationTestFailedError } from '../../domain/integration-credentials.errors';
import { IntegrationCredentialsByKind, TEST_FAILURE_REASONS } from '../../domain/integration.types';
import { modelsListingSchema } from '../../validation/integrations.schemas';
import { probe, reasonOf, readJson } from './tester-http';

const MODELS_PATH: string = '/models';
const CHAT_PATH: string = '/chat/completions';
const HTTP_BAD_REQUEST: number = 400;
const HTTP_NOT_FOUND: number = 404;
const HTTP_METHOD_NOT_ALLOWED: number = 405;
const MODELS_MISSING: ReadonlySet<number> = new Set([HTTP_NOT_FOUND, HTTP_METHOD_NOT_ALLOWED]);

@Injectable()
export class LlmTester {
    public constructor(
        @Inject(integrationCredentialsConfig.KEY) private readonly config: ConfigType<typeof integrationCredentialsConfig>
    ) {}

    public async test(credentials: IntegrationCredentialsByKind['llm']): Promise<void> {
        const response: Response = await probe(
            `${credentials.baseUrl}${MODELS_PATH}`,
            { method: 'GET', headers: this.headers(credentials.apiKey) },
            this.config.INTEGRATIONS_TEST_TIMEOUT_MS
        );
        if (response.ok) {
            return this.checkListing(credentials, await readJson(response));
        }
        await response.body?.cancel();
        if (MODELS_MISSING.has(response.status)) {
            return this.chat(credentials);
        }
        throw new IntegrationTestFailedError(reasonOf(response.status));
    }

    private async checkListing(credentials: IntegrationCredentialsByKind['llm'], body: unknown): Promise<void> {
        const listing: ReturnType<typeof modelsListingSchema.safeParse> = modelsListingSchema.safeParse(body);
        if (!listing.success) {
            return this.chat(credentials);
        }
        if (!listing.data.data.some((entry: { id: string }): boolean => entry.id === credentials.model)) {
            throw new IntegrationTestFailedError(TEST_FAILURE_REASONS.invalidModel);
        }
    }

    private async chat(credentials: IntegrationCredentialsByKind['llm']): Promise<void> {
        const response: Response = await probe(
            `${credentials.baseUrl}${CHAT_PATH}`,
            {
                method: 'POST',
                headers: this.headers(credentials.apiKey),
                body: JSON.stringify({ model: credentials.model, max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] })
            },
            this.config.INTEGRATIONS_TEST_TIMEOUT_MS
        );
        await response.body?.cancel();
        if (response.ok) {
            return;
        }
        const missingModel: boolean = response.status === HTTP_NOT_FOUND || response.status === HTTP_BAD_REQUEST;
        throw new IntegrationTestFailedError(missingModel ? TEST_FAILURE_REASONS.invalidModel : reasonOf(response.status));
    }

    private headers(apiKey: string): Record<string, string> {
        return { accept: 'application/json', 'content-type': 'application/json', authorization: `Bearer ${apiKey}` };
    }
}
