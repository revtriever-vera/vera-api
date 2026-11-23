import { describe, expect, it } from 'vitest';
import { statusOf } from './signup-link-status';
import { SignupLink } from './signup-links.types';

const NOW: Date = new Date('2026-11-23T12:00:00.000Z');

function link(overrides: Partial<SignupLink> = {}): SignupLink {
    return {
        id: 'id',
        token: 'token',
        label: 'Parceria',
        trialKind: 'none',
        trialDays: null,
        rules: [],
        maxUses: null,
        expiresAt: null,
        redemptionCount: 0,
        trialCount: 0,
        subscriptionCount: 0,
        revokedAt: null,
        createdByUserId: null,
        createdAt: NOW,
        updatedAt: NOW,
        ...overrides
    };
}

describe('statusOf', () => {
    it('está ativo sem revogação, validade vencida nem limite batido', () => {
        expect(statusOf(link(), NOW)).toBe('active');
        expect(statusOf(link({ maxUses: 5, redemptionCount: 4, expiresAt: new Date(NOW.getTime() + 1) }), NOW)).toBe('active');
    });

    it('revogado vale mais que o resto', () => {
        expect(statusOf(link({ revokedAt: NOW, expiresAt: new Date(NOW.getTime() - 1) }), NOW)).toBe('revoked');
    });

    it('expira exatamente na validade', () => {
        expect(statusOf(link({ expiresAt: NOW }), NOW)).toBe('expired');
    });

    it('esgota ao bater o limite de usos', () => {
        expect(statusOf(link({ maxUses: 5, redemptionCount: 5 }), NOW)).toBe('exhausted');
    });
});
