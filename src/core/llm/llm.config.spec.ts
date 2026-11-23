import { afterEach, describe, expect, it, vi } from 'vitest';
import { llmConfig } from './config/llm.config';

const PRICED: string = JSON.stringify({ 'meta/muse-spark-1.3-contributor': { input: 0.1, output: 0.2, cacheRead: 0.002 } });

const MANAGED: readonly string[] = [
    'LLM_DRIVER',
    'AI_GATEWAY_API_KEY',
    'LLM_MODEL_ID',
    'LLM_PRICE_TABLE',
    'LLM_TIMEOUT_MS',
    'LLM_MAX_RETRIES',
    'LLM_REPEAT_LIMIT',
    'DEPLOYMENT_MODE',
    'DEPLOY_ENV'
];

function load(env: Record<string, string>): ReturnType<typeof llmConfig> {
    for (const key of MANAGED) {
        vi.stubEnv(key, undefined);
    }
    for (const [key, value] of Object.entries(env)) {
        vi.stubEnv(key, value);
    }
    return llmConfig();
}

describe('llm.config', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('sobe sem chave: o driver padrão é mock e o modelo é o do card', () => {
        const config = load({});

        expect(config.LLM_DRIVER).toBe('mock');
        expect(config.LLM_MODEL_ID).toBe('meta/muse-spark-1.3-contributor');
        expect(config.LLM_TIMEOUT_MS).toBe(30_000);
        expect(config.LLM_MAX_RETRIES).toBe(2);
        expect(config.LLM_REPEAT_LIMIT).toBe(3);
    });

    it('hospedada com chave e modelo sem preço falha no boot', () => {
        expect(() => load({ DEPLOYMENT_MODE: 'hosted', AI_GATEWAY_API_KEY: 'k', LLM_DRIVER: 'live' })).toThrow(
            'LLM_PRICE_TABLE não tem preço'
        );
    });

    it('hospedada com chave e preço sobe', () => {
        const config = load({ DEPLOYMENT_MODE: 'hosted', AI_GATEWAY_API_KEY: 'k', LLM_PRICE_TABLE: PRICED });

        expect(config.LLM_PRICE_TABLE['meta/muse-spark-1.3-contributor']?.input).toBe(0.1);
    });

    it('hospedada sem chave sobe mesmo sem tabela', () => {
        expect(() => load({ DEPLOYMENT_MODE: 'hosted' })).not.toThrow();
    });

    it('auto-hospedada com modelo sem preço sobe', () => {
        expect(() => load({ DEPLOYMENT_MODE: 'self_hosted', AI_GATEWAY_API_KEY: 'k', LLM_MODEL_ID: 'qualquer' })).not.toThrow();
    });

    it('recusa tabela que não é JSON ou fora do formato', () => {
        expect(() => load({ LLM_PRICE_TABLE: 'x' })).toThrow('não é JSON válido');
        expect(() => load({ LLM_PRICE_TABLE: '{"m":{"input":"a"}}' })).toThrow('fora do formato');
    });
});
