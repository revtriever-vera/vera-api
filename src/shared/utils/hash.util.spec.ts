import { describe, expect, it } from 'vitest';
import { HashUtil } from './hash.util';

describe('HashUtil', () => {
    it('produces a stable sha256 hex digest for the same input', () => {
        expect(HashUtil.sha256('123456')).toBe(HashUtil.sha256('123456'));
    });

    it('produces different digests for different inputs', () => {
        expect(HashUtil.sha256('123456')).not.toBe(HashUtil.sha256('654321'));
    });

    it('returns a 64-character hex string', () => {
        expect(HashUtil.sha256('abc')).toMatch(/^[0-9a-f]{64}$/);
    });
});
