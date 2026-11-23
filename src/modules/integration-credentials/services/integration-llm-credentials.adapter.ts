import { Injectable, OnModuleInit } from '@nestjs/common';
import { LlmCredentialsHolder } from '../../../core/llm/ports/llm-credentials.holder';
import { LlmCredentialsPort } from '../../../core/llm/ports/llm-credentials.port';
import { LlmCredentials } from '../../../core/llm/llm.types';
import { IntegrationCredentialsByKind } from '../domain/integration.types';
import { IntegrationCredentialsService } from './integration-credentials.service';

@Injectable()
export class IntegrationLlmCredentialsAdapter extends LlmCredentialsPort implements OnModuleInit {
    public constructor(
        private readonly integrations: IntegrationCredentialsService,
        private readonly holder: LlmCredentialsHolder
    ) {
        super();
    }

    public onModuleInit(): void {
        this.holder.register(this);
    }

    public async resolve(): Promise<LlmCredentials | null> {
        const stored: IntegrationCredentialsByKind['llm'] | null = await this.integrations.resolve('llm');
        if (stored === null) {
            return null;
        }
        if (stored.provider === 'gateway') {
            return { driver: 'gateway', apiKey: stored.apiKey, modelId: stored.model };
        }
        return { driver: 'openai_compatible', baseUrl: stored.baseUrl, apiKey: stored.apiKey, modelId: stored.model };
    }
}
