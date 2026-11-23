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

    it('fora do local o fake nunca é aceito: sem driver ou com fake, o driver efetivo é revtriever e desligado, sem falhar o boot', () => {
        for (const env of [
            { IS_LOCAL: 'false' },
            { IS_LOCAL: 'false', DEPLOYMENT_MODE: 'hosted', BILLING_ENGINE_DRIVER: 'fake' },
            { IS_LOCAL: 'false', DEPLOYMENT_MODE: 'self_hosted' }
        ]) {
            const settings = parseBillingConfig(env);

            expect(settings.BILLING_ENGINE_DRIVER).toBe('revtriever');
            expect(settings.BILLING_ENGINE_ENABLED).toBe(false);
        }
        expect(parseBillingConfig({ IS_LOCAL: 'false', BILLING_ENGINE_DRIVER: 'fake' }).BILLING_FAKE_REFUSED).toBe(true);
        expect(parseBillingConfig({ IS_LOCAL: 'false' }).BILLING_FAKE_REFUSED).toBe(false);
    });

    it('fora do local, revtriever só liga com chave e plano; faltando um, fica desligado sem falhar o boot', () => {
        const base: NodeJS.ProcessEnv = { IS_LOCAL: 'false', BILLING_ENGINE_DRIVER: 'revtriever' };

        expect(parseBillingConfig(base).BILLING_ENGINE_ENABLED).toBe(false);
        expect(parseBillingConfig({ ...base, REVTRIEVER_API_KEY: 'k' }).BILLING_ENGINE_ENABLED).toBe(false);
        expect(parseBillingConfig({ ...base, REVTRIEVER_PLAN_ID: 'p' }).BILLING_ENGINE_ENABLED).toBe(false);
        expect(parseBillingConfig({ ...base, REVTRIEVER_API_KEY: 'k', REVTRIEVER_PLAN_ID: 'p' }).BILLING_ENGINE_ENABLED).toBe(true);
    });

    it('no local, o fake liga sozinho e o revtriever liga com a chave', () => {
        expect(parseBillingConfig({ IS_LOCAL: 'true' }).BILLING_ENGINE_ENABLED).toBe(true);
        expect(parseBillingConfig({ IS_LOCAL: 'true', BILLING_ENGINE_DRIVER: 'revtriever' }).BILLING_ENGINE_ENABLED).toBe(false);
        expect(
            parseBillingConfig({ IS_LOCAL: 'true', BILLING_ENGINE_DRIVER: 'revtriever', REVTRIEVER_API_KEY: 'k' }).BILLING_ENGINE_ENABLED
        ).toBe(true);
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
        expect(parseBillingConfig({ IS_LOCAL: 'false' }).FAKE_BILLING_WEBHOOK_SECRET).toBeNull();
        expect(parseBillingConfig({ IS_LOCAL: 'true' }).FAKE_BILLING_WEBHOOK_SECRET).toBe('vera-dev-billing-webhook-secret');
        expect(
            parseBillingConfig({ IS_LOCAL: 'true', FAKE_BILLING_WEBHOOK_SECRET: 'outro-segredo-de-teste' }).FAKE_BILLING_WEBHOOK_SECRET
        ).toBe('outro-segredo-de-teste');
    });

    it('lê o token e os segredos de rotação do webhook, a carência e o prazo de arrependimento', () => {
        const settings = parseBillingConfig({
            IS_LOCAL: 'false',
            REVTRIEVER_WEBHOOK_TOKEN: 'tok',
            REVTRIEVER_WEBHOOK_SECRETS: ' novo-segredo-123456 , antigo-segredo-123456 ',
            BILLING_GRACE_DAYS: '5',
            APP_URL: 'https://app.example.test/'
        });

        expect(settings.REVTRIEVER_WEBHOOK_TOKEN).toBe('tok');
        expect(settings.REVTRIEVER_WEBHOOK_SECRETS).toEqual(['novo-segredo-123456', 'antigo-segredo-123456']);
        expect(settings.BILLING_GRACE_DAYS).toBe(5);
        expect(settings.BILLING_WITHDRAWAL_DAYS).toBe(7);
        expect(settings.APP_URL).toBe('https://app.example.test');
    });

    it('sem token nem segredo configurados, nada é aceito; no local o fake entra com o segredo de desenvolvimento', () => {
        expect(parseBillingConfig({ IS_LOCAL: 'false' }).REVTRIEVER_WEBHOOK_SECRETS).toEqual([]);
        expect(parseBillingConfig({ IS_LOCAL: 'false' }).REVTRIEVER_WEBHOOK_TOKEN).toBeNull();
        expect(parseBillingConfig({ IS_LOCAL: 'true' }).REVTRIEVER_WEBHOOK_SECRETS).toHaveLength(1);
        expect(parseBillingConfig({ IS_LOCAL: 'true' }).BILLING_GRACE_DAYS).toBe(3);
    });
});
