import { describe, expect, it } from 'vitest';
import { parseBillingConfig } from './billing.config';

describe('parseBillingConfig', () => {
    it('usa o fake por padrão no local', () => {
        const settings = parseBillingConfig({ IS_LOCAL: 'true' });

        expect(settings.BILLING_ENGINE_DRIVER).toBe('fake');
        expect(settings.REVTRIEVER_TIMEOUT_MS).toBe(10_000);
        expect(settings.REVTRIEVER_MAX_RETRIES).toBe(2);
        expect(settings.REVTRIEVER_API_KEY).toBeNull();
    });

    it('exige o driver fora do local em hosted', () => {
        expect(() => parseBillingConfig({ IS_LOCAL: 'false', DEPLOYMENT_MODE: 'hosted' })).toThrow('BILLING_ENGINE_DRIVER');
        expect(() => parseBillingConfig({ IS_LOCAL: 'false' })).toThrow('BILLING_ENGINE_DRIVER');
    });

    it('assume o fake em self_hosted fora do local', () => {
        expect(parseBillingConfig({ IS_LOCAL: 'false', DEPLOYMENT_MODE: 'self_hosted' }).BILLING_ENGINE_DRIVER).toBe('fake');
    });

    it('falha o boot com revtriever sem chave ou sem plano fora do local', () => {
        const base: NodeJS.ProcessEnv = { IS_LOCAL: 'false', DEPLOYMENT_MODE: 'hosted', BILLING_ENGINE_DRIVER: 'revtriever' };

        expect(() => parseBillingConfig(base)).toThrow('REVTRIEVER_API_KEY e REVTRIEVER_PLAN_ID');
        expect(() => parseBillingConfig({ ...base, REVTRIEVER_API_KEY: 'k' })).toThrow('REVTRIEVER_PLAN_ID');
        expect(() => parseBillingConfig({ ...base, REVTRIEVER_PLAN_ID: 'p' })).toThrow('REVTRIEVER_API_KEY');
    });

    it('aceita revtriever completo e normaliza a URL', () => {
        const settings = parseBillingConfig({
            IS_LOCAL: 'false',
            DEPLOYMENT_MODE: 'hosted',
            BILLING_ENGINE_DRIVER: 'revtriever',
            REVTRIEVER_API_KEY: 'rk_test',
            REVTRIEVER_PLAN_ID: 'plan-1',
            REVTRIEVER_API_URL: 'https://api.example.test/',
            REVTRIEVER_MAX_RETRIES: '3',
            REVTRIEVER_TIMEOUT_MS: '2000'
        });

        expect(settings).toMatchObject({
            BILLING_ENGINE_DRIVER: 'revtriever',
            REVTRIEVER_API_URL: 'https://api.example.test',
            REVTRIEVER_MAX_RETRIES: 3,
            REVTRIEVER_TIMEOUT_MS: 2000,
            REVTRIEVER_GATEWAY_CONNECTION_ID: null
        });
    });

    it('no local, revtriever sem chave passa o boot (o driver recusa a chamada)', () => {
        expect(parseBillingConfig({ IS_LOCAL: 'true', BILLING_ENGINE_DRIVER: 'revtriever' }).REVTRIEVER_API_KEY).toBeNull();
    });

    it('lê as variáveis do fake e do script como opcionais', () => {
        const settings = parseBillingConfig({
            IS_LOCAL: 'true',
            FAKE_BILLING_FORCE_FAILURE: 'true',
            FAKE_BILLING_WEBHOOK_URL: 'http://localhost:3333/hook',
            BILLING_PRICE_ENDPOINT_URL: 'https://api.example.test/billing/revtriever/price',
            BILLING_PRICE_CEILING_CENTS: '5000'
        });

        expect(settings).toMatchObject({
            FAKE_BILLING_FORCE_FAILURE: true,
            FAKE_BILLING_WEBHOOK_URL: 'http://localhost:3333/hook',
            BILLING_PRICE_CEILING_CENTS: 5000,
            FAKE_BILLING_PUBLIC_URL: 'http://localhost:3333'
        });
    });

    it('o segredo de dev do webhook do fake só existe no local', () => {
        expect(parseBillingConfig({ IS_LOCAL: 'true' }).FAKE_BILLING_WEBHOOK_SECRET).toBe('vera-dev-billing-webhook-secret');
        expect(
            parseBillingConfig({ IS_LOCAL: 'true', FAKE_BILLING_WEBHOOK_SECRET: 'outro-segredo-de-teste' }).FAKE_BILLING_WEBHOOK_SECRET
        ).toBe('outro-segredo-de-teste');
    });

    it('fora do local, o fake sem URL de webhook não precisa de segredo e não ganha o de dev', () => {
        const settings = parseBillingConfig({ IS_LOCAL: 'false', DEPLOYMENT_MODE: 'hosted', BILLING_ENGINE_DRIVER: 'fake' });

        expect(settings.FAKE_BILLING_WEBHOOK_SECRET).toBeNull();
    });

    it('fora do local, o fake com URL de webhook exige segredo próprio de ao menos 16 caracteres', () => {
        const base: NodeJS.ProcessEnv = {
            IS_LOCAL: 'false',
            DEPLOYMENT_MODE: 'hosted',
            BILLING_ENGINE_DRIVER: 'fake',
            FAKE_BILLING_WEBHOOK_URL: 'https://api.example.test/hook'
        };

        expect(() => parseBillingConfig(base)).toThrow('FAKE_BILLING_WEBHOOK_SECRET');
        expect(() => parseBillingConfig({ ...base, FAKE_BILLING_WEBHOOK_SECRET: 'curto' })).toThrow();
        expect(parseBillingConfig({ ...base, FAKE_BILLING_WEBHOOK_SECRET: 'segredo-com-16-ou-mais' }).FAKE_BILLING_WEBHOOK_SECRET).toBe(
            'segredo-com-16-ou-mais'
        );
    });
});
