import { describe, expect, it } from 'vitest';
import { GatewayLlmDriver } from './gateway-llm.driver';
import { LlmDriverRouter } from './llm-driver-router';
import { MockLlmDriver } from './mock-llm.driver';
import { OpenAiCompatibleLlmDriver } from './openai-compatible-llm.driver';

describe('LlmDriverRouter', () => {
    it('devolve o driver pelo nome', () => {
        const gateway = {} as GatewayLlmDriver;
        const openai = {} as OpenAiCompatibleLlmDriver;
        const mock = {} as MockLlmDriver;
        const router: LlmDriverRouter = new LlmDriverRouter(gateway, openai, mock);

        expect(router.driverFor('gateway')).toBe(gateway);
        expect(router.driverFor('openai_compatible')).toBe(openai);
        expect(router.driverFor('mock')).toBe(mock);
    });
});
