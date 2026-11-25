import { describe, expect, it } from 'vitest';
import { LlmBootCheck } from './llm-boot-check';
import { LlmConfig } from './config/llm.config';
import { NoopLlmUsageAdapter } from './ports/noop-llm-usage.adapter';

function check(env: 'local' | 'dev' | 'prod', mode: 'hosted' | 'self_hosted', port: NoopLlmUsageAdapter | null): LlmBootCheck {
    return new LlmBootCheck({ DEPLOY_ENV: env, DEPLOYMENT_MODE: mode, AI_GATEWAY_API_KEY: '', LLM_PRICE_TABLE: {} } as LlmConfig, port);
}

describe('LlmBootCheck', () => {
    it('prod hospedado sem a porta de cota falha o boot', () => {
        expect(() => {
            check('prod', 'hosted', null).onModuleInit();
        }).toThrow('LlmUsagePort ausente');
    });

    it('prod hospedado com a porta sobe, e os outros cenários sobem sem ela', () => {
        expect(() => {
            check('prod', 'hosted', new NoopLlmUsageAdapter()).onModuleInit();
        }).not.toThrow();
        expect(() => {
            check('dev', 'hosted', null).onModuleInit();
        }).not.toThrow();
        expect(() => {
            check('prod', 'self_hosted', null).onModuleInit();
        }).not.toThrow();
    });

    it('hospedada com chave e modelo de visão sem preço falha o boot; com preço ou sem modelo de visão sobe', () => {
        const base = { DEPLOY_ENV: 'dev', DEPLOYMENT_MODE: 'hosted', AI_GATEWAY_API_KEY: 'k' } as const;
        const priced = { 'vendor/visao': { input: 1, output: 2, cacheRead: 0 } };

        expect(() => {
            new LlmBootCheck({ ...base, LLM_VISION_MODEL: 'vendor/visao', LLM_PRICE_TABLE: {} } as LlmConfig, null).onModuleInit();
        }).toThrow('modelo de visão vendor/visao');
        expect(() => {
            new LlmBootCheck({ ...base, LLM_VISION_MODEL: 'vendor/visao', LLM_PRICE_TABLE: priced } as LlmConfig, null).onModuleInit();
        }).not.toThrow();
        expect(() => {
            new LlmBootCheck({ ...base, LLM_PRICE_TABLE: {} } as LlmConfig, null).onModuleInit();
        }).not.toThrow();
    });
});
