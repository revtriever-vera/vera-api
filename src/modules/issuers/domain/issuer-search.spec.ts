import { describe, expect, it } from 'vitest';
import { normalizeSearchText, searchIssuers } from './issuer-search';
import { IssuerGroup, IssuerRecord } from './issuer.types';

const GROUPS: ReadonlyMap<string, IssuerGroup> = new Map([
    ['inter-co', { id: 'inter-co', name: 'Inter&Co' }],
    ['btg-pactual', { id: 'btg-pactual', name: 'BTG Pactual' }],
    ['itau-unibanco', { id: 'itau-unibanco', name: 'Itaú Unibanco' }],
    ['petrobras', { id: 'petrobras', name: 'Petrobras' }],
    ['outro', { id: 'outro', name: 'Sem grupo' }]
]);

function record(id: string, name: string, groupId: string, overrides: Partial<IssuerRecord> = {}): IssuerRecord {
    return { id, name, groupId, kind: 'bank', fgcAssociated: true, status: 'active', mergedInto: null, aliases: [], ...overrides };
}

const RECORDS: IssuerRecord[] = [
    record('banco-inter', 'Banco Inter', 'inter-co', { aliases: ['Inter'] }),
    record('banco-pan', 'Banco Pan', 'btg-pactual'),
    record('btg-pactual', 'BTG Pactual', 'btg-pactual'),
    record('itau-unibanco', 'Itaú Unibanco', 'itau-unibanco', { aliases: ['Itau'] }),
    record('petrobras', 'Petrobras', 'petrobras', { kind: 'company', fgcAssociated: false }),
    record('banco-velho', 'Banco Velho', 'btg-pactual', { status: 'retired', mergedInto: 'banco-pan' })
];

function ids(query: string, kind: 'bank' | 'company' | null = null, limit: number = 20): string[] {
    return searchIssuers(RECORDS, GROUPS, query, kind, limit).map((entry: IssuerRecord) => entry.id);
}

describe('normalizeSearchText', () => {
    it('drops accents, case and surrounding spaces', () => {
        expect(normalizeSearchText('  ITAÚ Ünibanco ')).toBe('itau unibanco');
    });
});

describe('searchIssuers', () => {
    it('ignores accent and case', () => {
        expect(ids('ITAU')).toEqual(['itau-unibanco']);
        expect(ids('itaú')).toEqual(['itau-unibanco']);
    });

    it('finds by alias and by id', () => {
        expect(ids('inter')).toEqual(['banco-inter']);
        expect(ids('banco-pan')).toEqual(['banco-pan']);
    });

    it('finds the institutions of a group by the group name, after the ones matching their own name', () => {
        expect(ids('pactual')).toEqual(['btg-pactual', 'banco-pan']);
        expect(ids('inter&co')).toEqual(['banco-inter']);
    });

    it('filters by kind', () => {
        expect(ids('', 'company')).toEqual(['petrobras']);
        expect(ids('petro', 'bank')).toEqual([]);
    });

    it('lists the active institutions by name when the text is empty', () => {
        expect(ids('')).toEqual(['banco-inter', 'banco-pan', 'btg-pactual', 'itau-unibanco', 'petrobras']);
    });

    it('shows a retired institution only on an exact match of its name', () => {
        expect(ids('banco velho')).toEqual(['banco-velho']);
        expect(ids('velho')).toEqual([]);
        expect(ids('banco')).not.toContain('banco-velho');
    });

    it('limits the number of results', () => {
        expect(ids('', null, 2)).toHaveLength(2);
    });

    it('ranks an exact name before a prefix before a contained match', () => {
        const records: IssuerRecord[] = [
            record('xp-investimentos', 'XP Investimentos', 'btg-pactual'),
            record('a-xp', 'A XP', 'btg-pactual'),
            record('xp', 'XP', 'btg-pactual')
        ];

        const found: string[] = searchIssuers(records, GROUPS, 'xp', null, 20).map((entry: IssuerRecord) => entry.id);

        expect(found).toEqual(['xp', 'xp-investimentos', 'a-xp']);
    });
});

describe('the other issuer option', () => {
    const withOther: IssuerRecord[] = [
        record('outro', 'Outro emissor (sem cobertura calculada)', 'outro', { kind: 'other', fgcAssociated: false }),
        ...RECORDS
    ];
    const names = (kind: 'bank' | 'company' | null): string[] =>
        searchIssuers(withOther, GROUPS, '', kind, 20).map((entry: IssuerRecord): string => entry.id);

    it('comes last and shows up under every kind filter', () => {
        expect(names(null).at(-1)).toBe('outro');
        expect(names('bank').at(-1)).toBe('outro');
        expect(names('company')).toEqual(['petrobras', 'outro']);
    });
});
