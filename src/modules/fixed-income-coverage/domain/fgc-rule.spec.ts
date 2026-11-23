import { describe, expect, it } from 'vitest';
import { computeCoverage, FgcResult, outsideReasonOf, simulate } from './fgc-rule';
import { FgcHolding, FgcIssuer } from './fgc.types';

const BTG: FgcIssuer = { name: 'BTG Pactual', groupId: 'btg-pactual', groupName: 'BTG Pactual', kind: 'bank', fgcAssociated: true };
const PAN: FgcIssuer = { name: 'Banco Pan', groupId: 'btg-pactual', groupName: 'BTG Pactual', kind: 'bank', fgcAssociated: true };
const ITAU: FgcIssuer = { name: 'Itaú', groupId: 'itau', groupName: 'Itaú Unibanco', kind: 'bank', fgcAssociated: true };

function holding(id: string, valueMinor: number, overrides: Partial<FgcHolding> = {}): FgcHolding {
    return {
        id,
        name: `Título ${id}`,
        kind: 'cdb',
        currency: 'BRL',
        valueMinor,
        estimated: false,
        matured: false,
        treasury: false,
        issuer: BTG,
        ...overrides
    };
}

function reasons(holdings: readonly FgcHolding[]): Record<string, string> {
    return Object.fromEntries(computeCoverage(holdings).outside.map((entry): [string, string] => [entry.id, entry.reason]));
}

describe('computeCoverage', () => {
    it.each([
        [24_999_999, 24_999_999, 0],
        [25_000_000, 25_000_000, 0],
        [25_000_001, 25_000_000, 1]
    ])('a group of %i is covered %i with %i over the limit', (total: number, covered: number, over: number) => {
        const [group] = computeCoverage([holding('a', total)]).groups;

        expect(group?.totalMinor).toBe(total);
        expect(group?.coveredMinor).toBe(covered);
        expect(group?.overMinor).toBe(over);
    });

    it('sums two banks of the same conglomerate', () => {
        const result: FgcResult = computeCoverage([holding('a', 15_000_000, { issuer: PAN }), holding('b', 15_000_000)]);

        expect(result.groups).toHaveLength(1);
        expect(result.groups[0]).toMatchObject({ totalMinor: 30_000_000, coveredMinor: 25_000_000, overMinor: 5_000_000 });
        expect(result.groups[0]?.titles.map((title) => title.issuerName)).toEqual(['Banco Pan', 'BTG Pactual']);
    });

    it('counts a title of an absorbed institution in the group it resolves to', () => {
        const absorbed: FgcIssuer = { ...BTG, name: 'Banco Absorvido' };

        expect(computeCoverage([holding('a', 100, { issuer: absorbed }), holding('b', 50)]).groups).toHaveLength(1);
    });

    it('accepts LCI, LCA and LC next to CDB', () => {
        const result: FgcResult = computeCoverage(
            ['cdb', 'lci', 'lca', 'lc'].map((kind: string, index: number) => holding(`t${String(index)}`, 100, { kind }))
        );

        expect(result.groups[0]?.totalMinor).toBe(400);
        expect(result.outside).toEqual([]);
    });

    it('sorts groups by total, largest first, and sums the covered amount', () => {
        const result: FgcResult = computeCoverage([holding('a', 100), holding('b', 900, { issuer: ITAU })]);

        expect(result.groups.map((group) => group.groupId)).toEqual(['itau', 'btg-pactual']);
        expect(result.coveredMinor).toBe(1_000);
        expect(result.capShareBps).toBe(0);
    });

    it('keeps the securities outside with the reason', () => {
        expect(
            reasons([
                holding('deb', 1, { kind: 'debenture' }),
                holding('cri', 1, { kind: 'cri' }),
                holding('cra', 1, { kind: 'cra' }),
                holding('tesouro', 1, { kind: null, treasury: true, issuer: null }),
                holding('sovereign', 1, { issuer: { ...BTG, kind: 'sovereign' } }),
                holding('usd', 1, { currency: 'USD' }),
                holding('other', 1, { issuer: { ...BTG, kind: 'company', fgcAssociated: false } }),
                holding('free', 1, { issuer: { ...BTG, fgcAssociated: false } }),
                holding('none', 1, { issuer: null }),
                holding('outro', 1, { issuer: { ...BTG, groupId: 'outro', kind: 'other', fgcAssociated: false } }),
                holding('outrodeb', 1, { kind: 'debenture', issuer: { ...BTG, groupId: 'outro', kind: 'other', fgcAssociated: false } })
            ])
        ).toEqual({
            deb: 'not_covered_kind',
            cri: 'not_covered_kind',
            cra: 'not_covered_kind',
            tesouro: 'tesouro',
            sovereign: 'tesouro',
            usd: 'foreign',
            other: 'not_associated',
            free: 'not_associated',
            none: 'missing_issuer',
            outro: 'not_calculated',
            outrodeb: 'not_calculated'
        });
    });

    it('ignores a matured security', () => {
        const result: FgcResult = computeCoverage([holding('a', 100, { matured: true })]);

        expect(result.groups).toEqual([]);
        expect(result.outside).toEqual([]);
    });

    it('shows a share above 10000 bps without failing when the covered total passes R$ 1 million', () => {
        const holdings: FgcHolding[] = [
            BTG,
            ITAU,
            { ...ITAU, groupId: 'bb' },
            { ...ITAU, groupId: 'sant' },
            { ...ITAU, groupId: 'brad' }
        ].map((issuer: FgcIssuer, index: number): FgcHolding => holding(`h${String(index)}`, 25_000_000, { issuer }));

        expect(computeCoverage(holdings).capShareBps).toBe(12_500);
    });

    it('keeps the estimated flag of a title', () => {
        expect(computeCoverage([holding('a', 10, { estimated: true })]).groups[0]?.titles[0]?.estimated).toBe(true);
    });
});

describe('outsideReasonOf', () => {
    it('is null for an eligible holding', () => {
        expect(outsideReasonOf(holding('a', 1))).toBeNull();
    });
});

describe('simulate', () => {
    const existing: FgcHolding[] = [holding('a', 20_000_000), holding('b', 1_000_000, { issuer: ITAU })];

    it('says covered while the group stays within the limit', () => {
        expect(simulate(existing, { issuer: PAN, kind: 'lci', valueMinor: 5_000_000, excludeTitleId: undefined })).toEqual({
            verdict: 'covered',
            groupId: 'btg-pactual',
            groupName: 'BTG Pactual',
            totalAfterMinor: 25_000_000,
            overMinor: 0
        });
    });

    it('says over_limit with the amount above the limit', () => {
        expect(simulate(existing, { issuer: PAN, kind: 'cdb', valueMinor: 5_000_001, excludeTitleId: undefined })).toMatchObject({
            verdict: 'over_limit',
            totalAfterMinor: 25_000_001,
            overMinor: 1
        });
    });

    it('does not count the security being edited twice', () => {
        expect(simulate(existing, { issuer: BTG, kind: 'cdb', valueMinor: 22_000_000, excludeTitleId: 'a' })).toMatchObject({
            verdict: 'covered',
            totalAfterMinor: 22_000_000
        });
    });

    it('starts a new group from zero', () => {
        const fresh: FgcIssuer = { ...ITAU, groupId: 'novo', groupName: 'Novo' };

        expect(simulate(existing, { issuer: fresh, kind: 'cdb', valueMinor: 7, excludeTitleId: undefined })).toMatchObject({
            verdict: 'covered',
            totalAfterMinor: 7
        });
    });

    it('answers not_covered_kind and not_associated without adding the value', () => {
        expect(simulate(existing, { issuer: PAN, kind: 'debenture', valueMinor: 9_000_000, excludeTitleId: undefined })).toMatchObject({
            verdict: 'not_covered_kind',
            totalAfterMinor: 20_000_000
        });
        expect(
            simulate(existing, { issuer: { ...PAN, fgcAssociated: false }, kind: 'cdb', valueMinor: 1, excludeTitleId: undefined })
        ).toMatchObject({ verdict: 'not_associated', overMinor: 0 });
        expect(
            simulate(existing, {
                issuer: { ...PAN, groupId: 'outro', kind: 'other', fgcAssociated: false },
                kind: 'debenture',
                valueMinor: 1,
                excludeTitleId: undefined
            })
        ).toMatchObject({ verdict: 'not_calculated', groupId: 'outro', totalAfterMinor: 0 });
    });
});
