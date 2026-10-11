import { BASE64URL_PATTERN, sealedEnvelopeSchema } from './sealed-envelope.schema';
import { SecretSealerDriverName } from './secret-sealer.port';

export interface SealedEnvelope {
    readonly v: 1;
    readonly d: SecretSealerDriverName;
    readonly k: string;
    readonly e?: string;
    readonly i: string;
    readonly t: string;
    readonly c: string;
}

export class InvalidSealedEnvelopeError extends Error {
    public constructor() {
        super('invalid sealed envelope');
        this.name = 'InvalidSealedEnvelopeError';
    }
}

export function encodeEnvelope(envelope: SealedEnvelope): string {
    return Buffer.from(JSON.stringify(envelope), 'utf8').toString('base64url');
}

export function decodeEnvelope(sealed: string): SealedEnvelope {
    if (!BASE64URL_PATTERN.test(sealed)) {
        throw new InvalidSealedEnvelopeError();
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(Buffer.from(sealed, 'base64url').toString('utf8'));
    } catch {
        throw new InvalidSealedEnvelopeError();
    }
    const result: ReturnType<typeof sealedEnvelopeSchema.safeParse> = sealedEnvelopeSchema.safeParse(parsed);
    if (!result.success) {
        throw new InvalidSealedEnvelopeError();
    }
    return result.data;
}

export function sealedDriverOf(sealed: string): SecretSealerDriverName | null {
    try {
        return decodeEnvelope(sealed).d;
    } catch {
        return null;
    }
}
