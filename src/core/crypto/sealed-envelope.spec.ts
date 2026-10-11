import { describe, expect, it } from 'vitest';
import { decodeEnvelope, encodeEnvelope, InvalidSealedEnvelopeError, SealedEnvelope, sealedDriverOf } from './sealed-envelope';

const LOCAL: SealedEnvelope = { v: 1, d: 'local', k: 'local-v1', i: 'aXY', t: 'dGFn', c: 'Y2lwaGVy' };
const KMS: SealedEnvelope = { ...LOCAL, d: 'kms', k: 'key-ref', e: 'ZGVr' };

function encodeRaw(value: unknown): string {
    return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

describe('sealed envelope', () => {
    it('round-trips a local envelope and a kms envelope', () => {
        expect(decodeEnvelope(encodeEnvelope(LOCAL))).toEqual(LOCAL);
        expect(decodeEnvelope(encodeEnvelope(KMS))).toEqual(KMS);
    });

    it('produces a base64url string without padding or separators', () => {
        expect(encodeEnvelope(KMS)).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('rejects an unknown version', () => {
        expect(() => decodeEnvelope(encodeRaw({ ...LOCAL, v: 2 }))).toThrow(InvalidSealedEnvelopeError);
    });

    it('rejects text that is not base64url', () => {
        expect(() => decodeEnvelope('not base64!')).toThrow(InvalidSealedEnvelopeError);
        expect(() => decodeEnvelope('')).toThrow(InvalidSealedEnvelopeError);
    });

    it('rejects base64url that is not JSON', () => {
        expect(() => decodeEnvelope(Buffer.from('plain text', 'utf8').toString('base64url'))).toThrow(InvalidSealedEnvelopeError);
    });

    it('rejects a missing field', () => {
        const { t: _tag, ...withoutTag } = LOCAL;

        expect(() => decodeEnvelope(encodeRaw(withoutTag))).toThrow(InvalidSealedEnvelopeError);
    });

    it('rejects an unknown extra field', () => {
        expect(() => decodeEnvelope(encodeRaw({ ...LOCAL, x: 'y' }))).toThrow(InvalidSealedEnvelopeError);
    });

    it('requires the wrapped key for kms and forbids it for local', () => {
        const { e: _wrapped, ...kmsWithoutKey } = KMS;

        expect(() => decodeEnvelope(encodeRaw(kmsWithoutKey))).toThrow(InvalidSealedEnvelopeError);
        expect(() => decodeEnvelope(encodeRaw({ ...LOCAL, e: 'ZGVr' }))).toThrow(InvalidSealedEnvelopeError);
    });

    it('reads the driver without throwing', () => {
        expect(sealedDriverOf(encodeEnvelope(KMS))).toBe('kms');
        expect(sealedDriverOf('garbage!')).toBeNull();
    });
});
