import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { STATE_TTL_MS } from './calendar.types';
import { newPkce, readStateText, stateTextOf } from './oauth-state';

const IDS: { companyId: string; userId: string; nonce: string; hint: string | null } = {
    companyId: '0192f3a0-7c11-7d3a-9a1e-3f5b6c7d8e90',
    userId: '0192f3a0-7c11-7d3a-9a1e-3f5b6c7d8e91',
    nonce: '0192f3a0-7c11-7d3a-9a1e-3f5b6c7d8e92',
    hint: 'ana@exemplo.com'
};

describe('oauth-state', () => {
    const now: Date = new Date('2026-11-23T12:00:00.000Z');

    it('devolve a pessoa, a company e o nonce enquanto a validade não passou', () => {
        const state = readStateText(stateTextOf(IDS, now), new Date(now.getTime() + STATE_TTL_MS - 1));

        expect(state).toMatchObject({ companyId: IDS.companyId, userId: IDS.userId, nonce: IDS.nonce, hint: IDS.hint });
    });

    it('recusa o state vencido, em 10 minutos', () => {
        expect(readStateText(stateTextOf(IDS, now), new Date(now.getTime() + STATE_TTL_MS))).toBeNull();
    });

    it('recusa texto que não é um state', () => {
        expect(readStateText('não é json', now)).toBeNull();
        expect(readStateText(JSON.stringify({ c: 'x', u: 'y', n: 'z', e: 1, h: null }), now)).toBeNull();
    });

    it('gera o desafio PKCE S256 do verifier', () => {
        const pkce = newPkce();

        expect(pkce.challenge).toBe(createHash('sha256').update(pkce.verifier).digest('base64url'));
        expect(pkce.verifier.length).toBeGreaterThanOrEqual(43);
        expect(newPkce().verifier).not.toBe(pkce.verifier);
    });
});
