import { afterEach, describe, expect, it, vi } from 'vitest';
import { MOCK_INDEX_BASE, MockIndexDriver } from './mock-index.driver';

describe('MockIndexDriver', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('gera fechamentos só em dias úteis, crescentes, até o dia corrente', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-11-25T15:00:00Z'));
        const driver: MockIndexDriver = new MockIndexDriver();

        const closes = await driver.fetchDaily('^BVSP', '1mo');

        expect(driver.configured).toBe(true);
        expect(driver.source).toBe('mock');
        expect(closes.at(-1)?.date).toBe('2026-11-25');
        expect(closes.every((point) => ![0, 6].includes(new Date(`${point.date}T12:00:00Z`).getUTCDay()))).toBe(true);
        expect(Number(closes[0]?.close)).toBeGreaterThanOrEqual(MOCK_INDEX_BASE);
        expect(Number(closes.at(-1)?.close)).toBeGreaterThan(Number(closes[0]?.close));
        const wide = await driver.fetchDaily('^BVSP', '10y');
        expect(wide.length).toBeGreaterThan(closes.length * 10);
    });
});
