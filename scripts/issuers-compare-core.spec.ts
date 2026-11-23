import { describe, expect, it } from 'vitest';
import { IssuerRecord } from '../src/modules/issuers/domain/issuer.types';
import { compareSources, namesOf } from './issuers-compare-core';

function bank(id: string, name: string, overrides: Partial<IssuerRecord> = {}): IssuerRecord {
    return { id, name, groupId: id, kind: 'bank', fgcAssociated: true, status: 'active', mergedInto: null, aliases: [], ...overrides };
}

describe('namesOf', () => {
    it('takes the first column of each line, without quotes and blank lines', () => {
        expect(namesOf('"Banco Inter";123\r\n\r\nBradesco;456\n')).toEqual(['Banco Inter', 'Bradesco']);
    });
});

describe('compareSources', () => {
    const institutions: IssuerRecord[] = [
        bank('banco-inter', 'Banco Inter', { aliases: ['Inter'] }),
        bank('bradesco', 'Bradesco'),
        bank('banco-x', 'Banco X', { fgcAssociated: false }),
        bank('petrobras', 'Petrobras', { kind: 'company', fgcAssociated: false })
    ];

    it('points the listed banks missing in each source and the associates not listed, ignoring accent and case', () => {
        const result = compareSources(institutions, ['BANCO INTER', 'Banco X'], ['Inter', 'Banco Pan']);

        expect(result.missingInConglomerates).toEqual(['bradesco']);
        expect(result.missingInFgc).toEqual(['bradesco']);
        expect(result.notListed).toEqual(['Banco Pan']);
    });

    it('reports nothing when the sources agree with the list', () => {
        const result = compareSources(institutions.slice(0, 2), ['Banco Inter', 'Bradesco'], ['Banco Inter', 'Bradesco']);

        expect(result).toEqual({ missingInConglomerates: [], missingInFgc: [], notListed: [] });
    });
});
