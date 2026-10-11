import { ExecutionContext } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { AlsAppContext } from '../../../core/context/als-app-context';
import { authConfig } from '../config/auth.config';
import { UnauthorizedError } from '../domain/identity.errors';
import { JwtAuthGuard } from './jwt-auth.guard';
import { TokenService } from './token.service';

const tokens: TokenService = new TokenService({
    JWT_SECRET: 'unit-test-secret-with-enough-length',
    ACCESS_TOKEN_TTL_MINUTES: 10
} as ConfigType<typeof authConfig>);

function executionOf(authorization: string | undefined): ExecutionContext {
    return { switchToHttp: () => ({ getRequest: () => ({ headers: { authorization } }) }) } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
    const context: AlsAppContext = new AlsAppContext();
    const guard: JwtAuthGuard = new JwtAuthGuard(tokens, context);
    const run = <T>(fn: () => T): T => context.run({ requestId: 'req-1', locale: 'pt-BR' }, fn);

    it('recusa quando não há cabeçalho', () => {
        expect(() => run(() => guard.canActivate(executionOf(undefined)))).toThrow(UnauthorizedError);
    });

    it('recusa esquema diferente de Bearer', () => {
        expect(() => run(() => guard.canActivate(executionOf('Basic abc')))).toThrow(UnauthorizedError);
    });

    it('recusa token inválido', () => {
        expect(() => run(() => guard.canActivate(executionOf('Bearer nao-e-jwt')))).toThrow(UnauthorizedError);
    });

    it('com token válido, preenche o contexto com usuário, company, sessão e locale', () => {
        const token: string = tokens.signAccessToken('user-1', 'company-1', 'session-1', 'en');

        const seen = run(() => {
            const allowed: boolean = guard.canActivate(executionOf(`Bearer ${token}`));
            return { allowed, data: context.get() };
        });

        expect(seen.allowed).toBe(true);
        expect(seen.data).toMatchObject({ userId: 'user-1', companyId: 'company-1', sessionId: 'session-1', locale: 'en' });
    });
});
