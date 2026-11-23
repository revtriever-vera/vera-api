import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { llmConfig } from '../config/llm.config';
import { LlmCredentials } from '../llm.types';
import { LlmCredentialsPort } from './llm-credentials.port';

@Injectable()
export class ConfigLlmCredentialsAdapter extends LlmCredentialsPort {
    public constructor(@Inject(llmConfig.KEY) private readonly config: ConfigType<typeof llmConfig>) {
        super();
    }

    public resolve(): Promise<LlmCredentials | null> {
        if (this.config.AI_GATEWAY_API_KEY.length === 0) {
            return Promise.resolve(null);
        }
        return Promise.resolve({
            driver: 'gateway',
            apiKey: this.config.AI_GATEWAY_API_KEY,
            modelId: this.config.LLM_MODEL_ID
        });
    }
}
