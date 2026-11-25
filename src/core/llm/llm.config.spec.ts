import { afterEach, describe, expect, it, vi } from 'vitest';
import { llmConfig } from './config/llm.config';

const PRICED: string = JSON.stringify({ 'meta/muse-spark-1.3-contributor': { input: 0.1, output: 0.2, cacheRead: 0.002 } });

const MANAGED: readonly string[] = [
    'IS_LOCAL',
    'LLM_DRIVER',
    'AI_GATEWAY_API_KEY',
    'LLM_MODEL_ID',
    'LLM_MODEL',
    'LLM_VISION_MODEL',
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

    it('fora do local o mock nunca é aceito, nem por padrão nem pedindo', () => {
        for (const env of [
            {} as Record<string, string>,
            { IS_LOCAL: 'false' },
            { LLM_DRIVER: 'mock' },
            { IS_LOCAL: 'false', LLM_DRIVER: 'mock' }
        ]) {
            expect(load(env).LLM_DRIVER).toBe('live');
        }
    });

    it('no local, sobe sem chave: o driver padrão é mock e o modelo é o do card', () => {
        const config = load({ IS_LOCAL: 'true', DEPLOY_ENV: 'local' });

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

    it('o modelo da instância (LLM_MODEL) é o que precisa de preço', () => {
        expect(() =>
            load({ DEPLOYMENT_MODE: 'hosted', AI_GATEWAY_API_KEY: 'k', LLM_MODEL: 'vendor/outro', LLM_PRICE_TABLE: PRICED })
        ).toThrow('vendor/outro');
    });

    it('LLM_MODEL e LLM_MODEL_ID vazios valem como ausentes e caem no modelo padrão', () => {
        const config = load({
            DEPLOYMENT_MODE: 'hosted',
            AI_GATEWAY_API_KEY: 'k',
            LLM_MODEL: '',
            LLM_MODEL_ID: '',
            LLM_PRICE_TABLE: PRICED
        });

        expect(config.LLM_MODEL).toBeUndefined();
        expect(config.LLM_MODEL_ID).toBe('meta/muse-spark-1.3-contributor');
    });

    it('LLM_VISION_MODEL é opcional (vazio vale ausente) e, na hospedada com chave, precisa de preço como o principal', () => {
        const base = { DEPLOYMENT_MODE: 'hosted', AI_GATEWAY_API_KEY: 'k', LLM_PRICE_TABLE: PRICED };

        expect(load({ ...base, LLM_VISION_MODEL: '' }).LLM_VISION_MODEL).toBeUndefined();
        expect(() => load({ ...base, LLM_VISION_MODEL: 'vendor/visao' })).toThrow('vendor/visao');
        expect(
            load({
                ...base,
                LLM_VISION_MODEL: 'vendor/visao',
                LLM_PRICE_TABLE: JSON.stringify({ ...JSON.parse(PRICED), 'vendor/visao': { input: 1, output: 2 } })
            }).LLM_VISION_MODEL
        ).toBe('vendor/visao');
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
