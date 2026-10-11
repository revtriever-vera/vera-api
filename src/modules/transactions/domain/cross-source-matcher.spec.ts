import { describe, expect, it } from 'vitest';
import { CandidatePool, MatchCandidate } from './cross-source-matcher';

function candidate(id: string, date: string, amountMinor: number, createdAt: string = '2026-10-01T10:00:00.000Z'): MatchCandidate {
    return { id, amountMinor, date, createdAt: new Date(createdAt) };
}

describe('CandidatePool', () => {
    it('mesmo valor com data +1 casa e com data +2 não casa', () => {
        const pool: CandidatePool = new CandidatePool([candidate('a', '2026-09-10', -5000)]);

        expect(pool.take({ amountMinor: -5000, date: '2026-09-12' })).toBeNull();
        expect(pool.take({ amountMinor: -5000, date: '2026-09-11' })?.id).toBe('a');
    });

    it('valor diferente nunca casa', () => {
        const pool: CandidatePool = new CandidatePool([candidate('a', '2026-09-10', -5000)]);

        expect(pool.take({ amountMinor: -5001, date: '2026-09-10' })).toBeNull();
        expect(pool.take({ amountMinor: 5000, date: '2026-09-10' })).toBeNull();
    });

    it('com duas candidatas vence a de data mais próxima', () => {
        const pool: CandidatePool = new CandidatePool([candidate('far', '2026-09-09', -5000), candidate('near', '2026-09-10', -5000)]);

        expect(pool.take({ amountMinor: -5000, date: '2026-09-10' })?.id).toBe('near');
    });

    it('no empate de data vence a mais antiga e, persistindo, o menor id', () => {
        const older: CandidatePool = new CandidatePool([
            candidate('new', '2026-09-10', -5000, '2026-10-02T10:00:00.000Z'),
            candidate('old', '2026-09-10', -5000, '2026-10-01T10:00:00.000Z')
        ]);
        const sameAge: CandidatePool = new CandidatePool([candidate('b', '2026-09-10', -5000), candidate('a', '2026-09-10', -5000)]);

        expect(older.take({ amountMinor: -5000, date: '2026-09-10' })?.id).toBe('old');
        expect(sameAge.take({ amountMinor: -5000, date: '2026-09-10' })?.id).toBe('a');
    });

    it('duas compras iguais no mesmo dia casam uma a uma e a sobra não tem par', () => {
        const pool: CandidatePool = new CandidatePool([candidate('a', '2026-09-10', -5000), candidate('b', '2026-09-10', -5000)]);

        const first = pool.take({ amountMinor: -5000, date: '2026-09-10' });
        const second = pool.take({ amountMinor: -5000, date: '2026-09-10' });
        const third = pool.take({ amountMinor: -5000, date: '2026-09-10' });

        expect([first?.id, second?.id]).toEqual(['a', 'b']);
        expect(third).toBeNull();
    });

    it('linha já tomada não casa de novo', () => {
        const pool: CandidatePool = new CandidatePool([candidate('a', '2026-09-10', -5000)]);

        pool.take({ amountMinor: -5000, date: '2026-09-10' });

        expect(pool.take({ amountMinor: -5000, date: '2026-09-10' })).toBeNull();
    });
});
