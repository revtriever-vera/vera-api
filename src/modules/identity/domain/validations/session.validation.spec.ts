import { describe, expect, it } from 'vitest';
import { InvalidRefreshTokenError } from '../identity.errors';
import { Session } from '../identity.types';
import { SessionValidation } from './session.validation';

function makeSession(overrides: Partial<Session> = {}): Session {
    return {
        id: 'session-1',
        companyId: 'company-1',
        userId: 'user-1',
        familyId: 'family-1',
        tokenHash: 'hash-1',
        replacedById: null,
        provider: 'google',
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
        ip: null,
        userAgent: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        ...overrides
    };
}

describe('SessionValidation', () => {
    it('considera reutilizada a sessão que já foi substituída', () => {
        expect(SessionValidation.isReused(makeSession({ replacedById: 'session-2' }))).toBe(true);
        expect(SessionValidation.isReused(makeSession())).toBe(false);
    });

    it('aceita uma sessão ativa', () => {
        expect(() => {
            SessionValidation.assertActive(makeSession());
        }).not.toThrow();
    });

    it('recusa sessão revogada', () => {
        expect(() => {
            SessionValidation.assertActive(makeSession({ revokedAt: new Date() }));
        }).toThrow(InvalidRefreshTokenError);
    });

    it('recusa sessão expirada', () => {
        expect(() => {
            SessionValidation.assertActive(makeSession({ expiresAt: new Date(Date.now() - 1000) }));
        }).toThrow(InvalidRefreshTokenError);
    });

    it('recusa quando não há sessão', () => {
        expect(() => {
            SessionValidation.assertRefreshable(null);
        }).toThrow(InvalidRefreshTokenError);
    });
});
