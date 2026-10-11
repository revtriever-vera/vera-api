import { describe, expect, it } from 'vitest';
import { bullPrefixFromEnvironment, DEFAULT_BULL_PREFIX } from './bull-prefix';

describe('bullPrefixFromEnvironment', () => {
    it('falls back to the default when the variable is missing or blank', () => {
        expect(bullPrefixFromEnvironment({})).toBe(DEFAULT_BULL_PREFIX);
        expect(bullPrefixFromEnvironment({ BULL_PREFIX: '   ' })).toBe(DEFAULT_BULL_PREFIX);
    });

    it('uses the configured prefix', () => {
        expect(bullPrefixFromEnvironment({ BULL_PREFIX: '{vera-qa66}' })).toBe('{vera-qa66}');
    });

    it('rejects a prefix without a hash tag', () => {
        expect(() => bullPrefixFromEnvironment({ BULL_PREFIX: 'vera-qa66' })).toThrow('hash tag');
    });
});
