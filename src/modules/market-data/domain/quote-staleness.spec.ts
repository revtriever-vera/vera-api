import { describe, expect, it } from 'vitest';
import { ageInDays, expectedPriceDate, isQuoteStale } from './quote-staleness';

describe('quote staleness', () => {
    it('does not flag a Friday close on the following Monday', () => {
        expect(isQuoteStale('2026-10-09', 'B3', '2026-10-12')).toBe(false);
        expect(isQuoteStale('2026-10-09', 'US', '2026-10-12')).toBe(false);
    });

    it('flags a five day old quote and keeps the exact border fresh', () => {
        expect(isQuoteStale('2026-10-06', 'B3', '2026-10-11')).toBe(true);
        expect(isQuoteStale('2026-10-07', 'B3', '2026-10-11')).toBe(false);
        expect(isQuoteStale('2026-10-07', 'TESOURO', '2026-10-11')).toBe(false);
    });

    it('uses the shorter window for crypto', () => {
        expect(isQuoteStale('2026-10-08', 'CRYPTO', '2026-10-11')).toBe(true);
        expect(isQuoteStale('2026-10-09', 'CRYPTO', '2026-10-11')).toBe(false);
    });

    it('measures the age in calendar days across month ends', () => {
        expect(ageInDays('2026-09-29', '2026-10-02')).toBe(3);
    });

    it('expects the last weekday session for exchanges, in the exchange time zone', () => {
        const saturdayNight: Date = new Date('2026-10-11T01:30:00Z');
        expect(expectedPriceDate('B3', saturdayNight)).toBe('2026-10-09');
        expect(expectedPriceDate('US', new Date('2026-10-12T01:00:00Z'))).toBe('2026-10-09');
        expect(expectedPriceDate('TESOURO', new Date('2026-10-14T12:00:00Z'))).toBe('2026-10-14');
    });

    it('expects the current UTC date for crypto', () => {
        expect(expectedPriceDate('CRYPTO', new Date('2026-10-11T01:30:00Z'))).toBe('2026-10-11');
    });
});
