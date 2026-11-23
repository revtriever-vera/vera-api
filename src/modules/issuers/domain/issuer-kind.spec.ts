import { describe, expect, it } from 'vitest';
import { issuerFitsTitle, issuerKindOfTitle } from './issuer-kind';
import { Issuer, IssuerKind } from './issuer.types';

function issuer(id: string, kind: IssuerKind): Issuer {
    return { id, name: id, groupId: id, kind, fgcAssociated: false, status: 'active', mergedInto: null };
}

const BANK: Issuer = issuer('banco-inter', 'bank');
const COMPANY: Issuer = issuer('petrobras', 'company');
const BRAZIL: Issuer = issuer('tesouro-nacional', 'sovereign');
const US: Issuer = issuer('tesouro-eua', 'sovereign');

describe('issuerKindOfTitle', () => {
    it.each([
        ['cdb', 'bank'],
        ['lci', 'bank'],
        ['lca', 'bank'],
        ['lc', 'bank'],
        ['debenture', 'company'],
        ['cri', 'company'],
        ['cra', 'company'],
        ['poupanca', null]
    ])('maps %s to %s', (titleKind, expected) => {
        expect(issuerKindOfTitle(titleKind)).toBe(expected);
    });
});

describe('issuerFitsTitle', () => {
    it.each(['cdb', 'lci', 'lca', 'lc'])('in BRL, %s takes a bank and refuses a company or a sovereign', (titleKind) => {
        expect(issuerFitsTitle(BANK, titleKind, 'BRL')).toBe(true);
        expect(issuerFitsTitle(COMPANY, titleKind, 'BRL')).toBe(false);
        expect(issuerFitsTitle(BRAZIL, titleKind, 'BRL')).toBe(false);
        expect(issuerFitsTitle(US, titleKind, 'BRL')).toBe(false);
    });

    it.each(['debenture', 'cri', 'cra'])('in BRL, %s takes a company and refuses a bank or a sovereign', (titleKind) => {
        expect(issuerFitsTitle(COMPANY, titleKind, 'BRL')).toBe(true);
        expect(issuerFitsTitle(BANK, titleKind, 'BRL')).toBe(false);
        expect(issuerFitsTitle(BRAZIL, titleKind, 'BRL')).toBe(false);
        expect(issuerFitsTitle(US, titleKind, 'BRL')).toBe(false);
    });

    it.each(['cdb', 'lci', 'debenture', 'cri'])('in USD, %s also takes a company or the US Treasury', (titleKind) => {
        expect(issuerFitsTitle(COMPANY, titleKind, 'USD')).toBe(true);
        expect(issuerFitsTitle(US, titleKind, 'USD')).toBe(true);
        expect(issuerFitsTitle(BRAZIL, titleKind, 'USD')).toBe(false);
    });

    it('in USD still takes the bank that fits the kind', () => {
        expect(issuerFitsTitle(BANK, 'cdb', 'USD')).toBe(true);
        expect(issuerFitsTitle(BANK, 'debenture', 'USD')).toBe(false);
    });
});
