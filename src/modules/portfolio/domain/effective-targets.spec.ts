import { describe, expect, it } from 'vitest';
import { effectiveAssetTargets } from './effective-targets';

describe('effective asset targets', () => {
    it('splits equally when nothing is stored, giving the remainder to the first by value then id', () => {
        const targets = effectiveAssetTargets([
            { id: 'c', valueMinor: 100, storedBps: 0 },
            { id: 'a', valueMinor: 100, storedBps: 0 },
            { id: 'b', valueMinor: 900, storedBps: 0 }
        ]);

        expect(targets.get('b')).toBe(3334);
        expect(targets.get('a')).toBe(3333);
        expect(targets.get('c')).toBe(3333);
        expect([...targets.values()].reduce((sum, value) => sum + value, 0)).toBe(10000);
    });

    it('splits two assets in halves', () => {
        const targets = effectiveAssetTargets([
            { id: 'a', valueMinor: 0, storedBps: 0 },
            { id: 'b', valueMinor: 0, storedBps: 0 }
        ]);

        expect([...targets.values()]).toEqual([5000, 5000]);
    });

    it('respects the stored targets when any is set', () => {
        const targets = effectiveAssetTargets([
            { id: 'a', valueMinor: 10, storedBps: 3000 },
            { id: 'b', valueMinor: 10, storedBps: 4000 },
            { id: 'c', valueMinor: 10, storedBps: 3000 }
        ]);

        expect([...targets.entries()]).toEqual([
            ['a', 3000],
            ['b', 4000],
            ['c', 3000]
        ]);
    });

    it('returns nothing for a class without assets', () => {
        expect(effectiveAssetTargets([]).size).toBe(0);
    });
});
