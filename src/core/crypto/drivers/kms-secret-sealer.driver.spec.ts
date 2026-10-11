import { randomBytes } from 'node:crypto';
import { DecryptCommand, GenerateDataKeyCommand, KMSClient } from '@aws-sdk/client-kms';
import { describe, expect, it, vi } from 'vitest';
import { decodeEnvelope, SealedEnvelope } from '../sealed-envelope';
import { SecretOpenFailedError, SecretSealFailedError, SecretSealerMismatchError } from '../secret-sealer.errors';
import { SealContext } from '../secret-sealer.port';
import { KMS_TIMEOUT_MS, KmsSecretSealerDriver } from './kms-secret-sealer.driver';
import { LocalSecretSealerDriver } from './local-secret-sealer.driver';

const KEY_ID: string = 'alias/vera-secrets-test';
const CONTEXT: SealContext = { companyId: 'company-a', purpose: 'test-purpose' };

interface SendOptions {
    readonly abortSignal?: AbortSignal;
}

interface FakeKms {
    readonly client: KMSClient;
    readonly send: ReturnType<typeof vi.fn>;
    readonly issuedKeys: Uint8Array[];
}

function sameContext(left: Record<string, string> | undefined, right: Record<string, string> | undefined): boolean {
    return JSON.stringify(Object.entries(left ?? {}).sort()) === JSON.stringify(Object.entries(right ?? {}).sort());
}

function fakeKms(): FakeKms {
    const wrapped: Map<string, { key: Buffer; context: Record<string, string> }> = new Map();
    const issuedKeys: Uint8Array[] = [];
    const send: ReturnType<typeof vi.fn> = vi.fn((command: unknown): Promise<unknown> => {
        if (command instanceof GenerateDataKeyCommand) {
            const key: Buffer = randomBytes(32);
            const blobId: string = randomBytes(8).toString('hex');
            wrapped.set(blobId, { key: Buffer.from(key), context: command.input.EncryptionContext ?? {} });
            const plaintext: Uint8Array = new Uint8Array(key);
            issuedKeys.push(plaintext);
            return Promise.resolve({ Plaintext: plaintext, CiphertextBlob: Buffer.from(blobId), KeyId: 'key-ref-1' });
        }
        const decrypt: DecryptCommand = command as DecryptCommand;
        const entry = wrapped.get(Buffer.from(decrypt.input.CiphertextBlob as Uint8Array).toString());
        if (entry === undefined || !sameContext(entry.context, decrypt.input.EncryptionContext)) {
            return Promise.reject(new Error('InvalidCiphertextException: provider detail that must not leak'));
        }
        const plaintext: Uint8Array = new Uint8Array(entry.key);
        issuedKeys.push(plaintext);
        return Promise.resolve({ Plaintext: plaintext, KeyId: 'key-ref-1' });
    });
    return { client: { send } as unknown as KMSClient, send, issuedKeys };
}

function driverOf(kms: FakeKms, legacy: LocalSecretSealerDriver | null = null): KmsSecretSealerDriver {
    return new KmsSecretSealerDriver(kms.client, KEY_ID, legacy);
}

describe('KmsSecretSealerDriver', () => {
    it('opens exactly what it sealed', async () => {
        const driver: KmsSecretSealerDriver = driverOf(fakeKms());

        await expect(driver.open(await driver.seal('vera-secret', CONTEXT), CONTEXT)).resolves.toBe('vera-secret');
    });

    it('asks for a data key with the encryption context bound to the company and the purpose', async () => {
        const kms: FakeKms = fakeKms();

        await driverOf(kms).seal('vera-secret', CONTEXT);

        const command: GenerateDataKeyCommand = kms.send.mock.calls[0]?.[0] as GenerateDataKeyCommand;
        expect(command.input).toMatchObject({
            KeyId: KEY_ID,
            KeySpec: 'AES_256',
            EncryptionContext: { companyId: 'company-a', purpose: 'test-purpose', app: 'vera' }
        });
    });

    it('stores only the wrapped key, never the plaintext key', async () => {
        const kms: FakeKms = fakeKms();

        const envelope: SealedEnvelope = decodeEnvelope(await driverOf(kms).seal('vera-secret', CONTEXT));

        expect(envelope).toMatchObject({ v: 1, d: 'kms', k: 'key-ref-1' });
        expect(Buffer.from(envelope.e ?? '', 'base64url').toString()).not.toContain(Buffer.from(kms.issuedKeys[0] ?? []).toString('hex'));
    });

    it('zeroes the plaintext key after sealing and after opening', async () => {
        const kms: FakeKms = fakeKms();
        const driver: KmsSecretSealerDriver = driverOf(kms);

        const sealed: string = await driver.seal('vera-secret', CONTEXT);
        await driver.open(sealed, CONTEXT);

        expect(kms.issuedKeys).toHaveLength(2);
        for (const key of kms.issuedKeys) {
            expect(key.every((byte: number): boolean => byte === 0)).toBe(true);
        }
    });

    it('zeroes the plaintext key even when decryption of the payload fails', async () => {
        const kms: FakeKms = fakeKms();
        const driver: KmsSecretSealerDriver = driverOf(kms);
        const sealed: string = await driver.seal('vera-secret', CONTEXT);
        const envelope: SealedEnvelope = decodeEnvelope(sealed);
        const corrupted: string = Buffer.from(JSON.stringify({ ...envelope, t: 'AAAAAAAAAAAAAAAAAAAAAA' }), 'utf8').toString('base64url');

        await expect(driver.open(corrupted, CONTEXT)).rejects.toBeInstanceOf(SecretOpenFailedError);

        expect(kms.issuedKeys.at(-1)?.every((byte: number): boolean => byte === 0)).toBe(true);
    });

    it('calls Decrypt with the same encryption context', async () => {
        const kms: FakeKms = fakeKms();
        const driver: KmsSecretSealerDriver = driverOf(kms);

        await driver.open(await driver.seal('vera-secret', CONTEXT), CONTEXT);

        const command: DecryptCommand = kms.send.mock.calls[1]?.[0] as DecryptCommand;
        expect(command.input).toMatchObject({
            KeyId: 'key-ref-1',
            EncryptionContext: { companyId: 'company-a', purpose: 'test-purpose', app: 'vera' }
        });
    });

    it('does not open under another company or another purpose', async () => {
        const driver: KmsSecretSealerDriver = driverOf(fakeKms());
        const sealed: string = await driver.seal('vera-secret', CONTEXT);

        await expect(driver.open(sealed, { ...CONTEXT, companyId: 'company-b' })).rejects.toBeInstanceOf(SecretOpenFailedError);
        await expect(driver.open(sealed, { ...CONTEXT, purpose: 'other' })).rejects.toBeInstanceOf(SecretOpenFailedError);
    });

    it('turns a KMS error into SecretOpenFailedError without the original message', async () => {
        const driver: KmsSecretSealerDriver = driverOf(fakeKms());
        const sealed: string = await driver.seal('vera-secret', CONTEXT);

        const error: SecretOpenFailedError = (await driver
            .open(sealed, { ...CONTEXT, companyId: 'company-b' })
            .catch((e: unknown) => e)) as SecretOpenFailedError;

        expect(error.code).toBe('core.secret_open_failed');
        expect(error.message).not.toContain('provider detail');
        expect(error.detail).not.toContain('provider detail');
        expect(error.cause).toBeUndefined();
        expect(error.meta).toEqual({ driver: 'kms', purpose: 'test-purpose' });
    });

    it('turns a KMS failure while sealing into SecretSealFailedError', async () => {
        const kms: FakeKms = fakeKms();
        kms.send.mockRejectedValueOnce(new Error('AccessDenied: provider detail'));

        const error: SecretSealFailedError = (await driverOf(kms)
            .seal('vera-secret', CONTEXT)
            .catch((e: unknown) => e)) as SecretSealFailedError;

        expect(error).toBeInstanceOf(SecretSealFailedError);
        expect(error.message).not.toContain('provider detail');
    });

    it('fails when KMS answers without the key material', async () => {
        const kms: FakeKms = fakeKms();
        kms.send.mockResolvedValueOnce({ KeyId: 'key-ref-1' });

        await expect(driverOf(kms).seal('vera-secret', CONTEXT)).rejects.toBeInstanceOf(SecretSealFailedError);
    });

    it('fails when KMS returns no plaintext on Decrypt', async () => {
        const kms: FakeKms = fakeKms();
        const driver: KmsSecretSealerDriver = driverOf(kms);
        const sealed: string = await driver.seal('vera-secret', CONTEXT);
        kms.send.mockResolvedValueOnce({});

        await expect(driver.open(sealed, CONTEXT)).rejects.toBeInstanceOf(SecretOpenFailedError);
    });

    it('bounds every KMS call with a timeout signal and fails when the call is aborted', async () => {
        const kms: FakeKms = fakeKms();
        const driver: KmsSecretSealerDriver = driverOf(kms);
        const sealed: string = await driver.seal('vera-secret', CONTEXT);
        await driver.open(sealed, CONTEXT);

        for (const call of kms.send.mock.calls) {
            expect((call[1] as SendOptions).abortSignal).toBeInstanceOf(AbortSignal);
        }
        expect(KMS_TIMEOUT_MS).toBe(5000);

        kms.send.mockRejectedValueOnce(new DOMException('The operation was aborted due to timeout', 'TimeoutError'));
        await expect(driver.open(sealed, CONTEXT)).rejects.toBeInstanceOf(SecretOpenFailedError);
    });

    it('fails on a malformed sealed value', async () => {
        await expect(driverOf(fakeKms()).open('nonsense!', CONTEXT)).rejects.toBeInstanceOf(SecretOpenFailedError);
    });

    it('refuses a local envelope unless legacy reading is enabled', async () => {
        const local: LocalSecretSealerDriver = new LocalSecretSealerDriver('c'.repeat(64));
        const legacySealed: string = await local.seal('old-secret', CONTEXT);

        await expect(driverOf(fakeKms()).open(legacySealed, CONTEXT)).rejects.toBeInstanceOf(SecretSealerMismatchError);
        await expect(driverOf(fakeKms(), local).open(legacySealed, CONTEXT)).resolves.toBe('old-secret');
    });
});
