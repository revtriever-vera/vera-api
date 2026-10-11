import { ConfigType } from '@nestjs/config';
import { createLocalJWKSet, CryptoKey, exportJWK, generateKeyPair, JWK, JWTVerifyGetKey, SignJWT } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { authConfig } from '../config/auth.config';
import { InvalidGoogleTokenError, ProviderDisabledError } from '../domain/identity.errors';
import { SocialIdentity } from '../domain/identity.types';
import { GoogleIdentityVerifier } from './google-identity.verifier';

const CLIENT_ID: string = 'fake-client.apps.example.test';

function configOf(clientId: string): ConfigType<typeof authConfig> {
    return { GOOGLE_CLIENT_ID: clientId } as ConfigType<typeof authConfig>;
}

describe('GoogleIdentityVerifier', () => {
    let privateKey: CryptoKey;
    let keys: JWTVerifyGetKey;
    let strangerKey: CryptoKey;

    beforeAll(async () => {
        const pair: { privateKey: CryptoKey; publicKey: CryptoKey } = await generateKeyPair('RS256');
        privateKey = pair.privateKey;
        const jwk: JWK = await exportJWK(pair.publicKey);
        keys = createLocalJWKSet({ keys: [{ ...jwk, kid: 'google-1', alg: 'RS256', use: 'sig' }] });
        strangerKey = (await generateKeyPair('RS256')).privateKey;
    });

    interface TokenOptions {
        readonly claims?: Record<string, unknown>;
        readonly key?: CryptoKey;
        readonly audience?: string;
        readonly issuer?: string;
        readonly expiration?: string;
        readonly subject?: string;
    }

    async function tokenOf(options: TokenOptions = {}): Promise<string> {
        return new SignJWT({ email: 'ana@example.test', email_verified: true, name: 'Ana', ...options.claims })
            .setProtectedHeader({ alg: 'RS256', kid: 'google-1' })
            .setIssuer(options.issuer ?? 'https://accounts.google.com')
            .setAudience(options.audience ?? CLIENT_ID)
            .setSubject(options.subject ?? 'google-sub-1')
            .setIssuedAt()
            .setExpirationTime(options.expiration ?? '5m')
            .sign(options.key ?? privateKey);
    }

    const verifier: GoogleIdentityVerifier = new GoogleIdentityVerifier(configOf(CLIENT_ID));

    it('devolve subject, e-mail minúsculo e nome de um token válido para o nosso client', async () => {
        const identity: SocialIdentity = await verifier.verifyWith(await tokenOf({ claims: { email: 'Ana@Example.TEST' } }), keys);

        expect(identity).toEqual({
            provider: 'google',
            subject: 'google-sub-1',
            email: 'ana@example.test',
            emailVerified: true,
            name: 'Ana'
        });
    });

    it('aceita o emissor sem esquema e nome ausente vira null', async () => {
        const identity: SocialIdentity = await verifier.verifyWith(
            await tokenOf({ issuer: 'accounts.google.com', claims: { name: undefined } }),
            keys
        );

        expect(identity.name).toBeNull();
    });

    it.each([
        ['token emitido para outro client', { audience: 'outro-client' }],
        ['token assinado por chave que não é do Google', { key: undefined, stranger: true }],
        ['emissor errado', { issuer: 'https://evil.example.test' }],
        ['token expirado', { expiration: '-1m' }],
        ['e-mail não verificado', { claims: { email_verified: false } }],
        ['token sem e-mail', { claims: { email: undefined } }]
    ])('recusa %s', async (_label: string, options: TokenOptions & { stranger?: boolean }) => {
        const token: string = await tokenOf(options.stranger ? { key: strangerKey } : options);

        await expect(verifier.verifyWith(token, keys)).rejects.toBeInstanceOf(InvalidGoogleTokenError);
    });

    it('recusa token sem subject', async () => {
        const token: string = await new SignJWT({ email: 'ana@example.test', email_verified: true })
            .setProtectedHeader({ alg: 'RS256', kid: 'google-1' })
            .setIssuer('https://accounts.google.com')
            .setAudience(CLIENT_ID)
            .setIssuedAt()
            .setExpirationTime('5m')
            .sign(privateKey);

        await expect(verifier.verifyWith(token, keys)).rejects.toBeInstanceOf(InvalidGoogleTokenError);
    });

    it('fica desligado sem client id, para o front esconder o botão', async () => {
        const disabled: GoogleIdentityVerifier = new GoogleIdentityVerifier(configOf(''));

        expect(disabled.enabled).toBe(false);
        expect(verifier.enabled).toBe(true);
        await expect(disabled.verifyWith(await tokenOf(), keys)).rejects.toBeInstanceOf(ProviderDisabledError);
    });

    it('verify usa o conjunto de chaves remoto e recusa token malformado sem rede', async () => {
        await expect(verifier.verify('not-a-jwt')).rejects.toBeInstanceOf(InvalidGoogleTokenError);
    });
});
