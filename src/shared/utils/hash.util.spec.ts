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

    it('computes the RFC 4231 HMAC-SHA256 test vector', () => {
        expect(HashUtil.hmacSha256('what do ya want for nothing?', 'Jefe')).toBe(
            '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843'
        );
    });
});
