import jwt from 'jsonwebtoken';
import { ConfigType } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { authConfig } from '../config/auth.config';
import { OpaqueToken, TokenClaims, TokenService } from './token.service';

const config: ConfigType<typeof authConfig> = {
    JWT_SECRET: 'unit-test-secret-with-enough-length',
    ACCESS_TOKEN_TTL_MINUTES: 10
} as ConfigType<typeof authConfig>;

const tokens: TokenService = new TokenService(config);

function forge(claims: Record<string, unknown>, secret: string = config.JWT_SECRET, options: jwt.SignOptions = {}): string {
    return jwt.sign(claims, secret, { algorithm: 'HS256', ...options });
}

const VALID: Record<string, unknown> = {
    sub: 'user-1',
    companyId: 'company-1',
    purpose: 'access',
    sessionId: 'session-1',
    locale: 'pt-BR'
};

describe('TokenService', () => {
    it('assina e verifica o access token com o locale no claim', () => {
        const token: string = tokens.signAccessToken('user-1', 'company-1', 'session-1', 'en', false);

        const claims: TokenClaims | null = tokens.verifyAccessToken(token);

        expect(claims).toEqual({
            sub: 'user-1',
            companyId: 'company-1',
            purpose: 'access',
            sessionId: 'session-1',
            locale: 'en',
            platform: false
        });
    });

    it('leva o claim platform só para a company de sistema', () => {
        const platform: string = tokens.signAccessToken('user-1', 'company-1', 'session-1', 'en', true);

        expect(tokens.verifyAccessToken(platform)?.platform).toBe(true);
        expect(tokens.verifyAccessToken(forge({ ...VALID, platform: 'true' }))?.platform).toBe(false);
        expect(tokens.verifyAccessToken(forge(VALID))?.platform).toBe(false);
    });

    it('expira o access token em dez minutos', () => {
        const token: string = tokens.signAccessToken('user-1', 'company-1', 'session-1', 'pt-BR', false);

        const decoded: jwt.JwtPayload = jwt.decode(token) as jwt.JwtPayload;

        expect((decoded.exp ?? 0) - (decoded.iat ?? 0)).toBe(600);
    });

    it('recusa token expirado', () => {
        expect(tokens.verifyAccessToken(forge(VALID, config.JWT_SECRET, { expiresIn: -10 }))).toBeNull();
    });

    it('recusa purpose diferente de access', () => {
        expect(tokens.verifyAccessToken(forge({ ...VALID, purpose: 'reset' }))).toBeNull();
    });

    it('recusa assinatura trocada', () => {
        expect(tokens.verifyAccessToken(forge(VALID, 'chave-errada-com-tamanho-suficiente'))).toBeNull();
    });

    it('recusa alg=none', () => {
        expect(tokens.verifyAccessToken(jwt.sign(VALID, '', { algorithm: 'none' }))).toBeNull();
    });

    it('recusa locale fora dos suportados', () => {
        expect(tokens.verifyAccessToken(forge({ ...VALID, locale: 'fr' }))).toBeNull();
    });

    it('recusa token sem claims obrigatórios', () => {
        expect(tokens.verifyAccessToken(forge({ ...VALID, sub: undefined }))).toBeNull();
        expect(tokens.verifyAccessToken(forge({ ...VALID, companyId: undefined }))).toBeNull();
        expect(tokens.verifyAccessToken(forge({ ...VALID, sessionId: undefined }))).toBeNull();
    });

    it('recusa texto que não é jwt', () => {
        expect(tokens.verifyAccessToken('nao-e-jwt')).toBeNull();
    });

    it('gera refresh opaco de 32 bytes cujo hash confere com hashToken', () => {
        const opaque: OpaqueToken = tokens.generateOpaqueToken();

        expect(Buffer.from(opaque.raw, 'base64url')).toHaveLength(32);
        expect(tokens.hashToken(opaque.raw)).toBe(opaque.hash);
        expect(opaque.hash).not.toBe(opaque.raw);
        expect(tokens.generateOpaqueToken().raw).not.toBe(opaque.raw);
    });

    it('o token de desafio e o de cadastro valem só para o seu passo, com TTLs próprios', () => {
        const challenge: string = tokens.signSecondFactorToken('totp_challenge', 'user-1', 'company-1');
        const enrollment: string = tokens.signSecondFactorToken('totp_enrollment', 'user-1', 'company-1');

        expect(tokens.verifySecondFactorToken(challenge, 'totp_challenge')).toEqual({ sub: 'user-1', companyId: 'company-1' });
        expect(tokens.verifySecondFactorToken(challenge, 'totp_enrollment')).toBeNull();
        expect(tokens.verifySecondFactorToken(enrollment, 'totp_challenge')).toBeNull();
        const ttl = (token: string): number => {
            const decoded: jwt.JwtPayload = jwt.decode(token) as jwt.JwtPayload;
            return (decoded.exp ?? 0) - (decoded.iat ?? 0);
        };
        expect(ttl(challenge)).toBe(300);
        expect(ttl(enrollment)).toBe(900);
    });

    it('nem o token de desafio nem o de cadastro abrem a API como access token', () => {
        const challenge: string = tokens.signSecondFactorToken('totp_challenge', 'user-1', 'company-1');
        const enrollment: string = tokens.signSecondFactorToken('totp_enrollment', 'user-1', 'company-1');

        expect(tokens.verifyAccessToken(challenge)).toBeNull();
        expect(tokens.verifyAccessToken(enrollment)).toBeNull();
    });

    it('o access token não serve como token de passo, e assinatura errada ou expiração são recusadas', () => {
        const access: string = tokens.signAccessToken('user-1', 'company-1', 'session-1', 'en', true);

        expect(tokens.verifySecondFactorToken(access, 'totp_challenge')).toBeNull();
        expect(
            tokens.verifySecondFactorToken(
                forge({ sub: 'u', companyId: 'c', purpose: 'totp_challenge' }, 'other-secret-with-length-xxxxxxxxx'),
                'totp_challenge'
            )
        ).toBeNull();
        expect(
            tokens.verifySecondFactorToken(
                forge({ sub: 'u', companyId: 'c', purpose: 'totp_challenge' }, config.JWT_SECRET, { expiresIn: -5 }),
                'totp_challenge'
            )
        ).toBeNull();
        expect(tokens.verifySecondFactorToken(forge({ purpose: 'totp_challenge' }), 'totp_challenge')).toBeNull();
    });
});
