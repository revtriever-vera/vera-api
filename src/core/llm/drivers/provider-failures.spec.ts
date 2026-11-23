import { describe, expect, it } from 'vitest';
import { fieldValueOf, ProviderCallError, providerCallErrorOf } from './provider-failures';

describe('providerCallErrorOf', () => {
    it.each([408, 429, 500, 503])('repete em %s', (status: number) => {
        expect(providerCallErrorOf({ statusCode: status }, false).retryable).toBe(true);
    });

    it.each([400, 401, 404, 422])('não repete em %s', (status: number) => {
        expect(providerCallErrorOf({ statusCode: status }, false).retryable).toBe(false);
    });

    it('repete erro de rede e timeout', () => {
        expect(providerCallErrorOf({ message: 'fetch failed' }, false).retryable).toBe(true);
        expect(providerCallErrorOf({ cause: { code: 'ECONNRESET' } }, false).retryable).toBe(true);
        const timeout: ProviderCallError = providerCallErrorOf(new Error('abort'), true);
        expect(timeout.retryable).toBe(true);
        expect(timeout.timedOut).toBe(true);
    });

    it('lê o status da causa e devolve o erro que já é nosso', () => {
        expect(providerCallErrorOf({ cause: { statusCode: 502 } }, false).status).toBe(502);
        const own: ProviderCallError = new ProviderCallError(400, 'x', false);
        expect(providerCallErrorOf(own, true)).toBe(own);
        expect(own.refusedRequest).toBe(true);
    });

    it('a falha de autenticação do gateway, que vem sem status, vale 401', () => {
        const error: ProviderCallError = providerCallErrorOf({ name: 'GatewayAuthenticationError' }, false);

        expect(error.status).toBe(401);
        expect(error.retryable).toBe(false);
        expect(error.probeReason).toBe('unauthorized');
    });

    it('mapeia o motivo do teste de credencial', () => {
        expect(providerCallErrorOf({ statusCode: 401 }, false).probeReason).toBe('unauthorized');
        expect(providerCallErrorOf({ statusCode: 403 }, false).probeReason).toBe('unauthorized');
        expect(providerCallErrorOf({ statusCode: 404 }, false).probeReason).toBe('model_not_found');
        expect(providerCallErrorOf({ statusCode: 500 }, false).probeReason).toBe('unreachable');
        expect(providerCallErrorOf({ message: 'fetch failed' }, false).probeReason).toBe('unreachable');
        expect(providerCallErrorOf(null, true).probeReason).toBe('timeout');
        expect(providerCallErrorOf({ name: 'AI_JSONParseError' }, false).probeReason).toBe('invalid_response');
    });

    it('usa o nome do erro como detalhe e lê campos aninhados', () => {
        expect(providerCallErrorOf({ name: 'Boom', statusCode: 500 }, false).detail).toBe('Boom');
        expect(providerCallErrorOf(5, false).detail).toBe('no detail');
        expect(fieldValueOf({ a: { b: 1 } }, ['a', 'b'])).toBe(1);
        expect(fieldValueOf(null, ['a'])).toBeUndefined();
    });
});
