import { describe, expect, it } from 'vitest';
import { ANY_HOLDER, holderFilterOf, holderQuerySchema, holderWhereOf, matchesHolder } from './holder-filter';

const ANA: string = '0199a000-0000-7000-8000-000000000001';

describe('holder filter', () => {
    it('parses the three forms', () => {
        expect(holderFilterOf('any')).toEqual(ANY_HOLDER);
        expect(holderFilterOf('all')).toEqual({ kind: 'all' });
        expect(holderFilterOf(ANA)).toEqual({ kind: 'person', userId: ANA });
    });

    it('defaults to any and rejects anything else', () => {
        expect(holderQuerySchema.parse(undefined)).toBe('any');
        expect(holderQuerySchema.safeParse('somebody').success).toBe(false);
        expect(holderQuerySchema.safeParse(ANA).success).toBe(true);
    });

    it('turns the filter into a where clause', () => {
        expect(holderWhereOf(ANY_HOLDER)).toEqual({});
        expect(holderWhereOf({ kind: 'all' })).toEqual({ holderUserId: null });
        expect(holderWhereOf({ kind: 'person', userId: ANA })).toEqual({ holderUserId: ANA });
    });

    it('matches a holder against the filter', () => {
        expect(matchesHolder(ANY_HOLDER, ANA)).toBe(true);
        expect(matchesHolder({ kind: 'all' }, null)).toBe(true);
        expect(matchesHolder({ kind: 'all' }, ANA)).toBe(false);
        expect(matchesHolder({ kind: 'person', userId: ANA }, ANA)).toBe(true);
        expect(matchesHolder({ kind: 'person', userId: ANA }, null)).toBe(false);
    });
});
