import { describe, expect, it } from 'vitest';
import { AppliedDateOutOfRangeError, InvalidTermsError } from './fixed-income.errors';
import { TitleTerms } from './fixed-income.types';
import { assertValidTerms, isRateWithinRange } from './terms-validation';

const TODAY: string = '2026-10-11';

function terms(overrides: Partial<TitleTerms> = {}): TitleTerms {
    return {
        kind: 'cdb',
        indexer: 'cdi_percent',
        rateBps: 11000,
        currency: 'BRL',
        appliedMinor: 1_000_000,
        appliedAt: '2025-04-10',
        maturityDate: '2028-04-10',
        ...overrides
    };
}

describe('assertValidTerms', () => {
    it('aceita termos coerentes', () => {
        expect(() => {
            assertValidTerms(terms(), TODAY);
        }).not.toThrow();
    });

    it('recusa aplicação antes de 2010-01-01 e no futuro', () => {
        expect(() => {
            assertValidTerms(terms({ appliedAt: '2009-12-31' }), TODAY);
        }).toThrow(AppliedDateOutOfRangeError);
        expect(() => {
            assertValidTerms(terms({ appliedAt: '2026-10-12' }), TODAY);
        }).toThrow(AppliedDateOutOfRangeError);
        expect(() => {
            assertValidTerms(terms({ appliedAt: '2010-01-01' }), TODAY);
        }).not.toThrow();
        expect(() => {
            assertValidTerms(terms({ appliedAt: TODAY, maturityDate: '2027-10-11' }), TODAY);
        }).not.toThrow();
    });

    it('recusa vencimento igual ou anterior à aplicação', () => {
        expect(() => {
            assertValidTerms(terms({ maturityDate: '2025-04-10' }), TODAY);
        }).toThrow(InvalidTermsError);
        expect(() => {
            assertValidTerms(terms({ maturityDate: '2025-04-09' }), TODAY);
        }).toThrow(InvalidTermsError);
    });

    it('limita o prazo a 50 anos', () => {
        expect(() => {
            assertValidTerms(terms({ appliedAt: '2025-04-10', maturityDate: '2075-04-10' }), TODAY);
        }).not.toThrow();
        expect(() => {
            assertValidTerms(terms({ appliedAt: '2025-04-10', maturityDate: '2075-04-20' }), TODAY);
        }).toThrow(InvalidTermsError);
    });

    it('dólar só com prefixado', () => {
        expect(() => {
            assertValidTerms(terms({ currency: 'USD' }), TODAY);
        }).toThrow(InvalidTermsError);
        expect(() => {
            assertValidTerms(terms({ currency: 'USD', indexer: 'prefixed', rateBps: 450 }), TODAY);
        }).not.toThrow();
    });

    it('aplica os limites de taxa por indexador', () => {
        expect(isRateWithinRange('cdi_percent', 0)).toBe(false);
        expect(isRateWithinRange('cdi_percent', 1)).toBe(true);
        expect(isRateWithinRange('cdi_percent', 30000)).toBe(true);
        expect(isRateWithinRange('cdi_percent', 30001)).toBe(false);
        expect(isRateWithinRange('prefixed', 0)).toBe(true);
        expect(isRateWithinRange('prefixed', 10001)).toBe(false);
        expect(isRateWithinRange('ipca_plus', 5000)).toBe(true);
        expect(isRateWithinRange('ipca_plus', 5001)).toBe(false);
        expect(() => {
            assertValidTerms(terms({ indexer: 'ipca_plus', rateBps: 6000 }), TODAY);
        }).toThrow(InvalidTermsError);
    });
});
