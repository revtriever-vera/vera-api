import { describe, expect, it } from 'vitest';
import { assertKnownIdsKept, buildIssuerIndex, resolveRecord } from './issuer-index';
import { IssuerGroup, IssuerRecord } from './issuer.types';

const GROUPS: IssuerGroup[] = [
    { id: 'a-group', name: 'A' },
    { id: 'tesouro-eua', name: 'Tesouro dos EUA' },
    { id: 'tesouro-nacional', name: 'Tesouro Nacional' }
];

function record(id: string, overrides: Partial<IssuerRecord> = {}): IssuerRecord {
    return {
        id,
        name: id,
        groupId: 'a-group',
        kind: 'bank',
        fgcAssociated: true,
        status: 'active',
        mergedInto: null,
        aliases: [],
        ...overrides
    };
}

const SOVEREIGNS: IssuerRecord[] = [
    record('tesouro-eua', { groupId: 'tesouro-eua', kind: 'sovereign', fgcAssociated: false }),
    record('tesouro-nacional', { groupId: 'tesouro-nacional', kind: 'sovereign', fgcAssociated: false })
];

function build(institutions: IssuerRecord[], groups: IssuerGroup[] = GROUPS): ReturnType<typeof buildIssuerIndex> {
    return buildIssuerIndex(
        [...institutions, ...SOVEREIGNS].sort((a, b) => (a.id < b.id ? -1 : 1)),
        groups
    );
}

function reason(run: () => unknown): unknown {
    try {
        run();
    } catch (error: unknown) {
        return (error as { meta?: { reason?: string } }).meta?.reason;
    }
    return null;
}

describe('buildIssuerIndex', () => {
    it('indexes institutions and groups by id', () => {
        const index = build([record('banco-a')]);

        expect(index.records.get('banco-a')?.groupId).toBe('a-group');
        expect(index.groups.get('a-group')?.name).toBe('A');
    });

    it('refuses a repeated or unsorted id', () => {
        expect(reason(() => buildIssuerIndex([record('b'), record('a')], GROUPS))).toBe('not_sorted');
        expect(reason(() => buildIssuerIndex([record('a'), record('a')], GROUPS))).toBe('duplicated_id');
        expect(reason(() => build([record('a')], [...GROUPS, { id: 'a-group', name: 'again' }]))).toBe('not_sorted');
    });

    it('refuses an institution whose group does not exist', () => {
        expect(reason(() => build([record('banco-a', { groupId: 'no-group' })]))).toBe('unknown_group');
    });

    it('refuses mergedInto on an active record, to a missing record or to itself', () => {
        expect(reason(() => build([record('a'), record('b', { mergedInto: 'a' })]))).toBe('invalid_merged_into');
        expect(reason(() => build([record('a', { status: 'retired', mergedInto: 'missing' })]))).toBe('invalid_merged_into');
        expect(reason(() => build([record('a', { status: 'retired', mergedInto: 'a' })]))).toBe('invalid_merged_into');
    });

    it('refuses a cycle of incorporations', () => {
        const cycle: IssuerRecord[] = [
            record('a', { status: 'retired', mergedInto: 'b' }),
            record('b', { status: 'retired', mergedInto: 'c' }),
            record('c', { status: 'retired', mergedInto: 'a' })
        ];

        expect(reason(() => build(cycle))).toBe('merge_cycle');
    });

    it('requires the two sovereign entries with their own group', () => {
        expect(reason(() => buildIssuerIndex([record('banco-a')], GROUPS))).toBe('missing_sovereign');
        expect(
            reason(() => buildIssuerIndex([record('tesouro-eua', { groupId: 'tesouro-eua' }), SOVEREIGNS[1] as IssuerRecord], GROUPS))
        ).toBe('missing_sovereign');
    });
});

describe('resolveRecord', () => {
    it('follows two levels of incorporation to the surviving institution', () => {
        const index = build([
            record('a', { status: 'retired', mergedInto: 'b' }),
            record('b', { status: 'retired', mergedInto: 'c' }),
            record('c', { groupId: 'a-group' })
        ]);

        expect(resolveRecord('a', index.records)?.id).toBe('c');
        expect(resolveRecord('c', index.records)?.id).toBe('c');
    });

    it('answers null for an unknown id', () => {
        expect(resolveRecord('nope', build([]).records)).toBeNull();
    });
});

describe('assertKnownIdsKept', () => {
    it('passes when every known id is still listed and fails when one was removed', () => {
        const index = build([record('banco-a')]);

        expect(() => {
            assertKnownIdsKept(['banco-a'], index.records);
        }).not.toThrow();
        expect(reason(() => assertKnownIdsKept(['banco-b'], index.records))).toBe('known_id_removed');
    });
});
