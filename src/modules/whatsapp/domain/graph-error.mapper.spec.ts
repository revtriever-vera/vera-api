import { describe, expect, it } from 'vitest';
import { graphErrorOf, isRetryable } from './graph-error.mapper';

const bodyOf = (code: number): unknown => ({ error: { code, message: 'x' } });

describe('graphErrorOf', () => {
    it('130429 é limite de taxa e repete', () => {
        const error = graphErrorOf(400, bodyOf(130429));

        expect(error.kind).toBe('rate_limited');
        expect(error.errorCode).toBe('130429');
        expect(isRetryable(error)).toBe(true);
    });

    it('131047 é janela fechada e 131026 destinatário inválido, ambos sem repetir', () => {
        expect(graphErrorOf(400, bodyOf(131047)).kind).toBe('window_closed');
        expect(graphErrorOf(400, bodyOf(131026)).kind).toBe('recipient_invalid');
        expect(isRetryable(graphErrorOf(400, bodyOf(131047)))).toBe(false);
    });

    it('190 e 401 são token inválido', () => {
        expect(graphErrorOf(400, bodyOf(190)).kind).toBe('token_invalid');
        expect(graphErrorOf(401, null).kind).toBe('token_invalid');
    });

    it('5xx, rede e 429 sem código repetem', () => {
        expect(graphErrorOf(503, null).kind).toBe('transient');
        expect(graphErrorOf(null, null).kind).toBe('transient');
        expect(graphErrorOf(429, null).kind).toBe('rate_limited');
    });

    it('um 4xx desconhecido é recusa sem repetir', () => {
        const error = graphErrorOf(400, bodyOf(100));

        expect(error.kind).toBe('rejected');
        expect(isRetryable(error)).toBe(false);
    });
});
