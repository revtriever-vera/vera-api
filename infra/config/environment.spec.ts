import { describe, expect, it } from 'vitest';
import { fromEnvironment } from './environment';
import { FAKE_ACCOUNT_DEV, FAKE_ACCOUNT_OTHER, FAKE_ACCOUNT_PROD, FAKE_DOMAIN, FAKE_SHARED, fakeEnvironment } from '../test/fixtures';

describe('fromEnvironment', () => {
    it('lê conta, domínio e bloco shared do ambiente dev', () => {
        const config = fromEnvironment('dev', fakeEnvironment());

        expect(config.account).toBe(FAKE_ACCOUNT_DEV);
        expect(config.shared).toEqual(FAKE_SHARED);
        expect(config.domain).toBe(FAKE_DOMAIN);
        expect(config.apiHost).toBe(`api-dev.${FAKE_DOMAIN}`);
        expect(config.appHost).toBe(`app-dev.${FAKE_DOMAIN}`);
        expect(config.mailpit?.host).toBe(`mail-dev.${FAKE_DOMAIN}`);
        expect(config.offHoursShutdown).toBe(true);
    });

    it('lê a conta de prod e deriva hosts sem sufixo', () => {
        const config = fromEnvironment('prod', fakeEnvironment());

        expect(config.account).toBe(FAKE_ACCOUNT_PROD);
        expect(config.apiHost).toBe(`api.${FAKE_DOMAIN}`);
        expect(config.appHost).toBe(`app.${FAKE_DOMAIN}`);
        expect(config.mailpit).toBeNull();
        expect(config.githubSubjects).toEqual(['repo:revtriever-vera/vera-api:environment:production']);
    });

    it('não deixa o subject de dev casar com pull request de fork', () => {
        const config = fromEnvironment('dev', fakeEnvironment());

        expect(config.githubSubjects).toEqual([
            'repo:revtriever-vera/vera-api:ref:refs/heads/main',
            'repo:revtriever-vera/vera-api:pull_request'
        ]);
    });

    it('recusa LLM_PRICE_TABLE que não é um objeto JSON', () => {
        expect(() => fromEnvironment('dev', fakeEnvironment({ LLM_PRICE_TABLE: '[1]' }))).toThrow('LLM_PRICE_TABLE inválida');
        expect(() => fromEnvironment('dev', fakeEnvironment({ LLM_PRICE_TABLE: 'x' }))).toThrow('LLM_PRICE_TABLE inválida');
    });

    it.each(['AWS_ACCOUNT_ID_DEV', 'SHARED_INFRA_DEV', 'VERA_DOMAIN', 'LLM_PRICE_TABLE'])(
        'falha nomeando %s quando ela falta',
        (variable: string) => {
            expect(() => fromEnvironment('dev', fakeEnvironment({ [variable]: undefined }))).toThrow(`${variable} não definida`);
        }
    );

    it('trata variável vazia como ausente', () => {
        expect(() => fromEnvironment('prod', fakeEnvironment({ AWS_ACCOUNT_ID_PROD: '  ' }))).toThrow('AWS_ACCOUNT_ID_PROD não definida');
    });

    it('recusa conta fora do formato de 12 dígitos', () => {
        expect(() => fromEnvironment('dev', fakeEnvironment({ AWS_ACCOUNT_ID_DEV: '12345' }))).toThrow('AWS_ACCOUNT_ID_DEV inválida');
    });

    it('recusa JSON inválido no bloco shared', () => {
        expect(() => fromEnvironment('dev', fakeEnvironment({ SHARED_INFRA_DEV: '{nope' }))).toThrow(
            'SHARED_INFRA_DEV inválida: não é um JSON'
        );
    });

    it('recusa bloco shared com campo faltando ou malformado, nomeando o campo', () => {
        const broken: string = JSON.stringify({ ...FAKE_SHARED, vpcId: 'abc', redisEndpoint: undefined });

        expect(() => fromEnvironment('dev', fakeEnvironment({ SHARED_INFRA_DEV: broken }))).toThrow(
            /vpcId.*redisEndpoint|redisEndpoint.*vpcId/
        );
    });

    it('prefixa todos os hosts de dev com VERA_HOST_PREFIX', () => {
        const config = fromEnvironment('dev', fakeEnvironment({ VERA_HOST_PREFIX: 'vera-' }));

        expect(config.apiHost).toBe(`vera-api-dev.${FAKE_DOMAIN}`);
        expect(config.appHost).toBe(`vera-app-dev.${FAKE_DOMAIN}`);
        expect(config.mailpit?.host).toBe(`vera-mail-dev.${FAKE_DOMAIN}`);
    });

    it('prefixa os hosts de prod com VERA_HOST_PREFIX', () => {
        const config = fromEnvironment('prod', fakeEnvironment({ VERA_HOST_PREFIX: 'vera-' }));

        expect(config.apiHost).toBe(`vera-api.${FAKE_DOMAIN}`);
        expect(config.appHost).toBe(`vera-app.${FAKE_DOMAIN}`);
    });

    it('não tem host de admin sem VERA_ADMIN_HOST', () => {
        expect(fromEnvironment('prod', fakeEnvironment()).adminHost).toBeNull();
        expect(fromEnvironment('prod', fakeEnvironment({ VERA_ADMIN_HOST: '  ' })).adminHost).toBeNull();
    });

    it('monta o host de admin com VERA_ADMIN_HOST, sem prefixo nem sufixo', () => {
        const config = fromEnvironment('prod', fakeEnvironment({ VERA_ADMIN_HOST: 'Admin-Vera', VERA_HOST_PREFIX: 'vera-' }));

        expect(config.adminHost).toBe(`admin-vera.${FAKE_DOMAIN}`);
    });

    it.each(['admin.vera', '-admin', 'admin-', 'admin_vera', 'a'.repeat(41)])('recusa o host de admin inválido %s', (value: string) => {
        expect(() => fromEnvironment('prod', fakeEnvironment({ VERA_ADMIN_HOST: value }))).toThrow('VERA_ADMIN_HOST inválida');
    });

    it('trata prefixo vazio como ausente', () => {
        expect(fromEnvironment('prod', fakeEnvironment({ VERA_HOST_PREFIX: '  ' })).apiHost).toBe(`api.${FAKE_DOMAIN}`);
    });

    it.each(['vera', 'vera_-', 've.ra-', 'abcdefghijklmnopqrstu-'])('recusa o prefixo inválido %s', (value: string) => {
        expect(() => fromEnvironment('dev', fakeEnvironment({ VERA_HOST_PREFIX: value }))).toThrow('VERA_HOST_PREFIX inválida');
    });

    it('recusa domínio com protocolo', () => {
        expect(() => fromEnvironment('dev', fakeEnvironment({ VERA_DOMAIN: 'https://vera.example.test' }))).toThrow('VERA_DOMAIN inválida');
    });

    it('lê as contas autorizadas a puxar imagem e valida o formato', () => {
        const config = fromEnvironment('dev', fakeEnvironment({ IMAGE_PULL_ACCOUNTS: `${FAKE_ACCOUNT_PROD}, ${FAKE_ACCOUNT_OTHER}` }));

        expect(config.imagePullAccounts).toEqual([FAKE_ACCOUNT_PROD, FAKE_ACCOUNT_OTHER]);
        expect(fromEnvironment('dev', fakeEnvironment()).imagePullAccounts).toEqual([]);
        expect(() => fromEnvironment('dev', fakeEnvironment({ IMAGE_PULL_ACCOUNTS: 'abc' }))).toThrow('IMAGE_PULL_ACCOUNTS inválida');
    });
    describe('agenda do Google', () => {
        it('em branco desliga a agenda, lê google e recusa o mock e driver desconhecido', () => {
            expect(fromEnvironment('prod', fakeEnvironment()).calendar).toEqual({ driver: null });
            expect(fromEnvironment('prod', fakeEnvironment({ GOOGLE_CALENDAR_DRIVER: 'google' })).calendar).toEqual({ driver: 'google' });
            for (const environment of ['dev', 'prod'] as const) {
                expect(() => fromEnvironment(environment, fakeEnvironment({ GOOGLE_CALENDAR_DRIVER: 'mock' }))).toThrow(
                    'mock não é aceito'
                );
            }
            expect(() => fromEnvironment('prod', fakeEnvironment({ GOOGLE_CALENDAR_DRIVER: 'outlook' }))).toThrow(
                'GOOGLE_CALENDAR_DRIVER inválida'
            );
        });
    });
    describe('motor de cobrança', () => {
        it('sem driver a cobrança fica desligada e nada da Revtriever é exigido', () => {
            const config = fromEnvironment('prod', fakeEnvironment());

            expect(config.billing).toEqual({ driver: null, apiUrl: null, planId: null, gatewayConnectionId: null });
        });

        it('lê o driver revtriever e as variáveis, ignorando as em branco', () => {
            const config = fromEnvironment(
                'prod',
                fakeEnvironment({
                    BILLING_ENGINE_DRIVER: 'revtriever',
                    REVTRIEVER_PLAN_ID: 'plan-x',
                    REVTRIEVER_API_URL: 'https://api.example.test',
                    REVTRIEVER_GATEWAY_CONNECTION_ID: '  '
                })
            );

            expect(config.billing).toEqual({
                driver: 'revtriever',
                apiUrl: 'https://api.example.test',
                planId: 'plan-x',
                gatewayConnectionId: null
            });
        });

        it('recusa o fake em ambiente hospedado', () => {
            for (const environment of ['dev', 'prod'] as const) {
                expect(() => fromEnvironment(environment, fakeEnvironment({ BILLING_ENGINE_DRIVER: 'fake' }))).toThrow('fake não é aceito');
            }
        });

        it('recusa driver desconhecido e revtriever sem plano', () => {
            expect(() => fromEnvironment('prod', fakeEnvironment({ BILLING_ENGINE_DRIVER: 'asaas' }))).toThrow(
                'BILLING_ENGINE_DRIVER inválida'
            );
            expect(() => fromEnvironment('prod', fakeEnvironment({ BILLING_ENGINE_DRIVER: 'revtriever' }))).toThrow('REVTRIEVER_PLAN_ID');
        });
    });
});
