import { describe, expect, it } from 'vitest';
import { decodeEnvelope, encodeEnvelope, SealedEnvelope } from '../sealed-envelope';
import { SecretOpenFailedError, SecretSealerMismatchError } from '../secret-sealer.errors';
import { SealContext } from '../secret-sealer.port';
import { LocalSecretSealerDriver } from './local-secret-sealer.driver';

const KEY_A: string = 'a'.repeat(64);
const KEY_B: string = 'b'.repeat(64);
const CONTEXT: SealContext = { companyId: 'company-a', purpose: 'test-purpose' };

function flipByte(value: string): string {
    const raw: Buffer = Buffer.from(value, 'base64url');
    raw[0] = (raw[0] ?? 0) ^ 0xff;
    return raw.toString('base64url');
}

function tampered(sealed: string, field: 'c' | 't'): string {
    const envelope: SealedEnvelope = decodeEnvelope(sealed);
    return encodeEnvelope({ ...envelope, [field]: flipByte(envelope[field]) });
}

describe('LocalSecretSealerDriver', () => {
    const driver: LocalSecretSealerDriver = new LocalSecretSealerDriver(KEY_A);

    it('opens exactly what it sealed', async () => {
        await expect(driver.open(await driver.seal('vera-secret', CONTEXT), CONTEXT)).resolves.toBe('vera-secret');
    });

    it('round-trips an empty string and unicode', async () => {
        await expect(driver.open(await driver.seal('', CONTEXT), CONTEXT)).resolves.toBe('');
        await expect(driver.open(await driver.seal('segredo-ção-🔐', CONTEXT), CONTEXT)).resolves.toBe('segredo-ção-🔐');
    });

    it('seals the same text into different outputs because the IV is random', async () => {
        expect(await driver.seal('same', CONTEXT)).not.toBe(await driver.seal('same', CONTEXT));
    });

    it('writes a v1 local envelope with the local key reference and no wrapped key', async () => {
        const envelope: SealedEnvelope = decodeEnvelope(await driver.seal('x', CONTEXT));

        expect(envelope).toMatchObject({ v: 1, d: 'local', k: 'local-v1' });
        expect(envelope.e).toBeUndefined();
    });

    it('does not open under another company', async () => {
        const sealed: string = await driver.seal('vera-secret', CONTEXT);

        await expect(driver.open(sealed, { ...CONTEXT, companyId: 'company-b' })).rejects.toBeInstanceOf(SecretOpenFailedError);
    });

    it('does not open under another purpose', async () => {
        const sealed: string = await driver.seal('vera-secret', CONTEXT);

        await expect(driver.open(sealed, { ...CONTEXT, purpose: 'other-purpose' })).rejects.toBeInstanceOf(SecretOpenFailedError);
    });

    it('does not open with another master key', async () => {
        const sealed: string = await driver.seal('vera-secret', CONTEXT);

        await expect(new LocalSecretSealerDriver(KEY_B).open(sealed, CONTEXT)).rejects.toBeInstanceOf(SecretOpenFailedError);
    });

    it('fails when one byte of the ciphertext or of the tag changes', async () => {
        const sealed: string = await driver.seal('vera-secret', CONTEXT);

        await expect(driver.open(tampered(sealed, 'c'), CONTEXT)).rejects.toBeInstanceOf(SecretOpenFailedError);
        await expect(driver.open(tampered(sealed, 't'), CONTEXT)).rejects.toBeInstanceOf(SecretOpenFailedError);
    });

    it('fails on a malformed sealed value', async () => {
        await expect(driver.open('nonsense!', CONTEXT)).rejects.toBeInstanceOf(SecretOpenFailedError);
    });

    it('refuses an envelope from another driver', async () => {
        const foreign: string = encodeEnvelope({ v: 1, d: 'kms', k: 'k', e: 'ZGVr', i: 'aXY', t: 'dGFn', c: 'Yw' });

        await expect(driver.open(foreign, CONTEXT)).rejects.toBeInstanceOf(SecretSealerMismatchError);
    });

    it('reports the open failure without detail beyond the driver and the purpose', async () => {
        const error: SecretOpenFailedError = (await driver.open('nonsense!', CONTEXT).catch((e: unknown) => e)) as SecretOpenFailedError;

        expect(error.code).toBe('core.secret_open_failed');
        expect(error.status).toBe(500);
        expect(error.meta).toEqual({ driver: 'local', purpose: 'test-purpose' });
        expect(error.cause).toBeUndefined();
    });
});
