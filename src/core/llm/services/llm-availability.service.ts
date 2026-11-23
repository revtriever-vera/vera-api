import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { llmConfig } from '../config/llm.config';
import { LlmCredentialsPort } from '../ports/llm-credentials.port';

@Injectable()
export class LlmAvailabilityService {
    public constructor(
        @Inject(llmConfig.KEY) private readonly config: ConfigType<typeof llmConfig>,
        private readonly credentials: LlmCredentialsPort
    ) {}

    public async enabled(): Promise<boolean> {
        if (this.config.LLM_DRIVER === 'mock') {
            return true;
        }
        return (await this.credentials.resolve()) !== null;
    }
}
