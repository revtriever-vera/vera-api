import { describe, expect, it } from 'vitest';
import { LlmConfig } from '../config/llm.config';
import { ConfigLlmCredentialsAdapter } from './config-llm-credentials.adapter';
import { LlmCredentialsHolder } from './llm-credentials.holder';
import { LlmCredentialsPort } from './llm-credentials.port';
import { NoopLlmUsageAdapter } from './noop-llm-usage.adapter';

describe('adaptadores de porta do core/llm', () => {
    it('as credenciais da config são nulas sem chave e do gateway com ela', async () => {
        const without = new ConfigLlmCredentialsAdapter({ AI_GATEWAY_API_KEY: '', LLM_MODEL_ID: 'm' } as LlmConfig);
        const withKey = new ConfigLlmCredentialsAdapter({ AI_GATEWAY_API_KEY: 'k', LLM_MODEL_ID: 'm' } as LlmConfig);

        expect(await without.resolve()).toBeNull();
        expect(await withKey.resolve()).toEqual({ driver: 'gateway', apiKey: 'k', modelId: 'm' });
    });

    it('a cota nula deixa passar e não grava', async () => {
        const noop: NoopLlmUsageAdapter = new NoopLlmUsageAdapter();

        await expect(noop.assertRoom({ feature: 'ai', task: 't', estimateMicros: 1 })).resolves.toBeUndefined();
        await expect(noop.record({ feature: 'ai', task: 't', referenceId: 'r', costMicros: 1 })).resolves.toBeUndefined();
    });

    it('o holder usa a config até alguém registrar a porta real, e depois a porta real', async () => {
        const fallback = new ConfigLlmCredentialsAdapter({ AI_GATEWAY_API_KEY: 'k', LLM_MODEL_ID: 'm' } as LlmConfig);
        const real: LlmCredentialsPort = {
            resolve: () => Promise.resolve({ driver: 'openai_compatible', baseUrl: 'http://h/v1', apiKey: 'a', modelId: 'local' })
        };
        const holder: LlmCredentialsHolder = new LlmCredentialsHolder(fallback);

        expect(await holder.resolve()).toEqual({ driver: 'gateway', apiKey: 'k', modelId: 'm' });
        holder.register(real);
        expect((await holder.resolve())?.driver).toBe('openai_compatible');
    });
});
