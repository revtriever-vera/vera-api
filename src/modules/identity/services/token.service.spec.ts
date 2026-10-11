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
        const token: string = tokens.signAccessToken('user-1', 'company-1', 'session-1', 'en');

        const claims: TokenClaims | null = tokens.verifyAccessToken(token);

        expect(claims).toEqual({ sub: 'user-1', companyId: 'company-1', purpose: 'access', sessionId: 'session-1', locale: 'en' });
    });

    it('expira o access token em dez minutos', () => {
        const token: string = tokens.signAccessToken('user-1', 'company-1', 'session-1', 'pt-BR');

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
});
