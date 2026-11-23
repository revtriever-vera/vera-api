import { describe, expect, it } from 'vitest';
import { ANY_HOLDER } from '../../../shared/holder/holder-filter';
import { DirectoryMember } from '../../identity/services/member-directory.service';
import { FgcCoverage, FgcGroup, FgcHolderBlock } from '../domain/fgc.types';
import { toFgcResponse } from './fgc-response.mapper';

const ANA: string = '0199a000-0000-7000-8000-000000000001';
const BEA: string = '0199a000-0000-7000-8000-000000000002';
const MEMBERS: DirectoryMember[] = [
    { userId: ANA, name: 'Ana' },
    { userId: BEA, name: 'Bea' }
];

const GROUP: FgcGroup = {
    groupId: 'a',
    groupName: 'A',
    totalMinor: 30_000_000,
    coveredMinor: 25_000_000,
    overMinor: 5_000_000,
    titles: []
};

function block(holderUserId: string | null, coveredMinor: number, capShareBps: number): FgcHolderBlock {
    return { holderUserId, coveredMinor, capShareBps, groups: [GROUP], outside: [] };
}

describe('toFgcResponse', () => {
    it('answers an empty account with zeros and no blocks', () => {
        const response = toFgcResponse({ asOf: '2026-01-05', blocks: [] }, ANY_HOLDER, MEMBERS);

        expect(response).toMatchObject({ scope: 'account', peopleCount: 2, coveredMinor: 0, groups: [], outside: [], byHolder: [] });
    });

    it('keeps the single block at the top level', () => {
        const coverage: FgcCoverage = { asOf: '2026-01-05', blocks: [block(null, 25_000_000, 2500)] };

        const response = toFgcResponse(coverage, ANY_HOLDER, MEMBERS);

        expect(response).toMatchObject({ scope: 'account', coveredMinor: 25_000_000, capShareBps: 2500, byHolder: [] });
        expect(response.groups).toHaveLength(1);
    });

    it('marks the scope as holder when a holder was asked for', () => {
        const response = toFgcResponse({ asOf: '2026-01-05', blocks: [block(ANA, 1, 1)] }, { kind: 'all' }, MEMBERS);

        expect(response.scope).toBe('holder');
    });

    it('splits by holder with the total at the top, "Conta toda" first and the people in order', () => {
        const coverage: FgcCoverage = {
            asOf: '2026-01-05',
            blocks: [block(BEA, 10_000_000, 1000), block(ANA, 25_000_000, 2500), block(null, 5_000_000, 500)]
        };

        const response = toFgcResponse(coverage, ANY_HOLDER, MEMBERS);

        expect(response.byHolder.map((entry) => entry.holder?.name ?? null)).toEqual([null, 'Ana', 'Bea']);
        expect(response).toMatchObject({ coveredMinor: 40_000_000, capShareBps: 2500, groups: [], outside: [] });
    });

    it('reads a holder that is no longer on the account as "Conta toda"', () => {
        const coverage: FgcCoverage = { asOf: '2026-01-05', blocks: [block('gone', 1, 1), block(ANA, 1, 1)] };

        const response = toFgcResponse(coverage, ANY_HOLDER, MEMBERS);

        expect(response.byHolder[0]?.holder).toBeNull();
    });
});
