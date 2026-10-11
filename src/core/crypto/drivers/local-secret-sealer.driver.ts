import { hkdfSync } from 'node:crypto';
import { decodeEnvelope, encodeEnvelope, SealedEnvelope } from '../sealed-envelope';
import { SecretOpenFailedError, SecretSealerMismatchError } from '../secret-sealer.errors';
import { SealContext, SecretSealerDriverName, SecretSealerPort } from '../secret-sealer.port';
import { decryptWithKey, encryptWithKey, GcmParts } from './aes-gcm-sealing';

const HKDF_SALT: string = 'vera-sealer-v1';
const KEY_LENGTH: number = 32;
export const LOCAL_KEY_REF: string = 'local-v1';

export class LocalSecretSealerDriver extends SecretSealerPort {
    public readonly driver: SecretSealerDriverName = 'local';
    private readonly masterKey: Buffer;

    public constructor(masterKeyHex: string) {
        super();
        this.masterKey = Buffer.from(masterKeyHex, 'hex');
    }

    public seal(plain: string, context: SealContext): Promise<string> {
        const parts: GcmParts = encryptWithKey(this.keyFor(context), plain, context);
        return Promise.resolve(encodeEnvelope({ v: 1, d: 'local', k: LOCAL_KEY_REF, ...parts }));
    }

    public open(sealed: string, context: SealContext): Promise<string> {
        let envelope: SealedEnvelope;
        try {
            envelope = decodeEnvelope(sealed);
        } catch {
            return Promise.reject(new SecretOpenFailedError('local', context.purpose));
        }
        if (envelope.d !== 'local') {
            return Promise.reject(new SecretSealerMismatchError('local', envelope.d));
        }
        return this.openEnvelope(envelope, context);
    }

    public openEnvelope(envelope: SealedEnvelope, context: SealContext): Promise<string> {
        try {
            return Promise.resolve(decryptWithKey(this.keyFor(context), envelope, context));
        } catch {
            return Promise.reject(new SecretOpenFailedError('local', context.purpose));
        }
    }

    private keyFor(context: SealContext): Buffer {
        const info: string = `${context.companyId}|${context.purpose}`;
        return Buffer.from(hkdfSync('sha256', this.masterKey, HKDF_SALT, info, KEY_LENGTH));
    }
}
