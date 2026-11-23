import { describe, expect, it } from 'vitest';
import { makeRates } from '../../../../test/support/schedule-fixtures';
import { nominalAnnualRate } from './reference-rates';

describe('nominalAnnualRate', () => {
    it('prefixado é a própria taxa, sem depender de série', () => {
        const rates = makeRates({ cdiAnnual: null, ipca12m: null });

        expect(nominalAnnualRate('prefixed', 1250, rates)?.toNumber()).toBe(0.125);
    });

    it('CDI percentual multiplica a taxa do CDI', () => {
        expect(nominalAnnualRate('cdi_percent', 11000, makeRates())?.toNumber()).toBeCloseTo(0.11, 12);
        expect(nominalAnnualRate('cdi_percent', 11000, makeRates({ cdiAnnual: null }))).toBeNull();
    });

    it('IPCA mais taxa compõe a inflação com a taxa contratada', () => {
        expect(nominalAnnualRate('ipca_plus', 600, makeRates())?.toNumber()).toBeCloseTo(1.04 * 1.06 - 1, 12);
        expect(nominalAnnualRate('ipca_plus', 600, makeRates({ ipca12m: null }))).toBeNull();
    });
});
