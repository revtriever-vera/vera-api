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

    it.each(['AWS_ACCOUNT_ID_DEV', 'SHARED_INFRA_DEV', 'VERA_DOMAIN'])('falha nomeando %s quando ela falta', (variable: string) => {
        expect(() => fromEnvironment('dev', fakeEnvironment({ [variable]: undefined }))).toThrow(`${variable} não definida`);
    });

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

    it('recusa domínio com protocolo', () => {
        expect(() => fromEnvironment('dev', fakeEnvironment({ VERA_DOMAIN: 'https://vera.example.test' }))).toThrow('VERA_DOMAIN inválida');
    });

    it('lê as contas autorizadas a puxar imagem e valida o formato', () => {
        const config = fromEnvironment('dev', fakeEnvironment({ IMAGE_PULL_ACCOUNTS: `${FAKE_ACCOUNT_PROD}, ${FAKE_ACCOUNT_OTHER}` }));

        expect(config.imagePullAccounts).toEqual([FAKE_ACCOUNT_PROD, FAKE_ACCOUNT_OTHER]);
        expect(fromEnvironment('dev', fakeEnvironment()).imagePullAccounts).toEqual([]);
        expect(() => fromEnvironment('dev', fakeEnvironment({ IMAGE_PULL_ACCOUNTS: 'abc' }))).toThrow('IMAGE_PULL_ACCOUNTS inválida');
    });
});
