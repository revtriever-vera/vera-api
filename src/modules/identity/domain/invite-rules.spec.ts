import { describe, expect, it } from 'vitest';
import {
    hashInviteToken,
    inviteExpiryFrom,
    isInviteExpired,
    isInviteUsable,
    maskEmail,
    newInviteToken,
    normalizeEmail
} from './invite-rules';

const NOW: Date = new Date('2026-03-01T12:00:00.000Z');

describe('invite-rules', () => {
    it('expira exatamente no limite', () => {
        const expiresAt: Date = inviteExpiryFrom(NOW, 7);

        expect(expiresAt.toISOString()).toBe('2026-03-08T12:00:00.000Z');
        expect(isInviteExpired({ expiresAt }, new Date(expiresAt.getTime() - 1))).toBe(false);
        expect(isInviteExpired({ expiresAt }, expiresAt)).toBe(true);
    });

    it('só serve o convite pendente, não expirado e não revogado', () => {
        const expiresAt: Date = inviteExpiryFrom(NOW, 7);

        expect(isInviteUsable({ expiresAt, acceptedAt: null, revokedAt: null }, NOW)).toBe(true);
        expect(isInviteUsable({ expiresAt, acceptedAt: NOW, revokedAt: null }, NOW)).toBe(false);
        expect(isInviteUsable({ expiresAt, acceptedAt: null, revokedAt: NOW }, NOW)).toBe(false);
        expect(isInviteUsable({ expiresAt, acceptedAt: null, revokedAt: null }, expiresAt)).toBe(false);
    });

    it('gera um token novo a cada vez, e o hash bate com o do token cru', () => {
        const first = newInviteToken();
        const second = newInviteToken();

        expect(first.raw).not.toBe(second.raw);
        expect(first.raw).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(first.hash).toBe(hashInviteToken(first.raw));
        expect(first.hash).not.toContain(first.raw);
    });

    it('mascara o e-mail deixando só a primeira letra e o domínio', () => {
        expect(maskEmail('Lucas@Gmail.com')).toBe('l***@gmail.com');
        expect(maskEmail('a@x.io')).toBe('a***@x.io');
    });

    it('normaliza o e-mail', () => {
        expect(normalizeEmail('  Ana@Example.Test ')).toBe('ana@example.test');
    });
});
