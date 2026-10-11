import { DecryptCommand, DecryptCommandOutput, GenerateDataKeyCommand, GenerateDataKeyCommandOutput, KMSClient } from '@aws-sdk/client-kms';
import { decodeEnvelope, encodeEnvelope, SealedEnvelope } from '../sealed-envelope';
import { SecretOpenFailedError, SecretSealFailedError, SecretSealerMismatchError } from '../secret-sealer.errors';
import { SealContext, SecretSealerDriverName, SecretSealerPort } from '../secret-sealer.port';
import { decryptWithKey, encryptWithKey, GcmParts } from './aes-gcm-sealing';
import { LocalSecretSealerDriver } from './local-secret-sealer.driver';

export const KMS_TIMEOUT_MS: number = 5000;
const APP_CONTEXT_VALUE: string = 'vera';

function encryptionContextOf(context: SealContext): Record<string, string> {
    return { companyId: context.companyId, purpose: context.purpose, app: APP_CONTEXT_VALUE };
}

export class KmsSecretSealerDriver extends SecretSealerPort {
    public readonly driver: SecretSealerDriverName = 'kms';

    public constructor(
        private readonly client: KMSClient,
        private readonly keyId: string,
        private readonly legacyLocal: LocalSecretSealerDriver | null
    ) {
        super();
    }

    public async seal(plain: string, context: SealContext): Promise<string> {
        const generated: GenerateDataKeyCommandOutput = await this.generateDataKey(context);
        const key: Uint8Array | undefined = generated.Plaintext;
        const wrapped: Uint8Array | undefined = generated.CiphertextBlob;
        if (key === undefined || wrapped === undefined) {
            key?.fill(0);
            throw new SecretSealFailedError('kms', context.purpose);
        }
        const parts: GcmParts = this.encryptAndWipe(key, plain, context);
        return encodeEnvelope({
            v: 1,
            d: 'kms',
            k: generated.KeyId ?? this.keyId,
            e: Buffer.from(wrapped).toString('base64url'),
            ...parts
        });
    }

    public async open(sealed: string, context: SealContext): Promise<string> {
        let envelope: SealedEnvelope;
        try {
            envelope = decodeEnvelope(sealed);
        } catch {
            throw new SecretOpenFailedError('kms', context.purpose);
        }
        if (envelope.d === 'kms') {
            return this.openKms(envelope, context);
        }
        if (this.legacyLocal === null) {
            throw new SecretSealerMismatchError('kms', envelope.d);
        }
        return this.legacyLocal.openEnvelope(envelope, context);
    }

    private encryptAndWipe(key: Uint8Array, plain: string, context: SealContext): GcmParts {
        try {
            return encryptWithKey(key, plain, context);
        } catch {
            throw new SecretSealFailedError('kms', context.purpose);
        } finally {
            key.fill(0);
        }
    }

    private async generateDataKey(context: SealContext): Promise<GenerateDataKeyCommandOutput> {
        try {
            return await this.client.send(
                new GenerateDataKeyCommand({
                    KeyId: this.keyId,
                    KeySpec: 'AES_256',
                    EncryptionContext: encryptionContextOf(context)
                }),
                { abortSignal: AbortSignal.timeout(KMS_TIMEOUT_MS) }
            );
        } catch {
            throw new SecretSealFailedError('kms', context.purpose);
        }
    }

    private async openKms(envelope: SealedEnvelope, context: SealContext): Promise<string> {
        let key: Uint8Array | undefined;
        try {
            const decrypted: DecryptCommandOutput = await this.client.send(
                new DecryptCommand({
                    KeyId: envelope.k,
                    CiphertextBlob: Buffer.from(envelope.e ?? '', 'base64url'),
                    EncryptionContext: encryptionContextOf(context)
                }),
                { abortSignal: AbortSignal.timeout(KMS_TIMEOUT_MS) }
            );
            key = decrypted.Plaintext;
            if (key === undefined) {
                throw new Error('no plaintext');
            }
            return decryptWithKey(key, envelope, context);
        } catch {
            throw new SecretOpenFailedError('kms', context.purpose);
        } finally {
            key?.fill(0);
        }
    }
}
