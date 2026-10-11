import { describe, expect, it } from 'vitest';
import { makePrototypeSource } from '../../../../test/support/portfolio-fixtures';
import { dollarExposureOf } from './dollar-exposure';
import { buildSnapshot } from './portfolio-snapshot';

describe('dollar exposure', () => {
    it('is 47.43 percent for the prototype portfolio', () => {
        const snapshot = buildSnapshot(makePrototypeSource());

        expect(snapshot.dollarExposure).toEqual({ valueMinor: 84_095_040, shareBps: 4743 });
    });

    it('counts a BRL asset flagged with exposure, such as IVVB11', () => {
        const exposure = dollarExposureOf([{ nativeCurrency: 'BRL', dollarExposure: true, valueMinor: 500 }], 1000);

        expect(exposure).toEqual({ valueMinor: 500, shareBps: 5000 });
    });

    it('ignores a BRL asset without exposure', () => {
        const exposure = dollarExposureOf([{ nativeCurrency: 'BRL', dollarExposure: false, valueMinor: 500 }], 1000);

        expect(exposure).toEqual({ valueMinor: 0, shareBps: 0 });
    });

    it('counts a USD asset even without the flag', () => {
        expect(dollarExposureOf([{ nativeCurrency: 'USD', dollarExposure: false, valueMinor: 250 }], 1000).shareBps).toBe(2500);
    });

    it('returns zero share for an empty portfolio', () => {
        expect(dollarExposureOf([], 0)).toEqual({ valueMinor: 0, shareBps: 0 });
    });
});
