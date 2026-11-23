import { Injectable } from '@nestjs/common';
import { LlmDriverName } from '../llm.types';
import { GatewayLlmDriver } from './gateway-llm.driver';
import { LlmDriver } from './llm-driver';
import { MockLlmDriver } from './mock-llm.driver';
import { OpenAiCompatibleLlmDriver } from './openai-compatible-llm.driver';

@Injectable()
export class LlmDriverRouter {
    public constructor(
        private readonly gateway: GatewayLlmDriver,
        private readonly openaiCompatible: OpenAiCompatibleLlmDriver,
        private readonly mock: MockLlmDriver
    ) {}

    public driverFor(name: LlmDriverName): LlmDriver {
        if (name === 'gateway') {
            return this.gateway;
        }
        return name === 'openai_compatible' ? this.openaiCompatible : this.mock;
    }
}
