const REDACTED: string = '[redacted]';

export interface PluggyCredentialsPair {
    readonly clientId: string;
    readonly clientSecret: string;
}

export class PluggySession {
    readonly #apiKey: string;

    public constructor(apiKey: string) {
        this.#apiKey = apiKey;
    }

    public headerValue(): string {
        return this.#apiKey;
    }

    public toJSON(): string {
        return REDACTED;
    }

    public toString(): string {
        return REDACTED;
    }

    public [Symbol.for('nodejs.util.inspect.custom')](): string {
        return REDACTED;
    }
}

export class PluggyCredentialsPlain {
    readonly #clientId: string;
    readonly #clientSecret: string;

    public constructor(clientId: string, clientSecret: string) {
        this.#clientId = clientId;
        this.#clientSecret = clientSecret;
    }

    public static fromSealedJson(json: string): PluggyCredentialsPlain {
        const parsed: PluggyCredentialsPair = JSON.parse(json) as PluggyCredentialsPair;
        return new PluggyCredentialsPlain(parsed.clientId, parsed.clientSecret);
    }

    public get clientIdValue(): string {
        return this.#clientId;
    }

    public pair(): PluggyCredentialsPair {
        return { clientId: this.#clientId, clientSecret: this.#clientSecret };
    }

    public toSealableJson(): string {
        return JSON.stringify(this.pair());
    }

    public toJSON(): string {
        return REDACTED;
    }

    public toString(): string {
        return REDACTED;
    }

    public [Symbol.for('nodejs.util.inspect.custom')](): string {
        return REDACTED;
    }
}
