export type SecretSealerDriverName = 'kms' | 'local';

export interface SealContext {
    readonly companyId: string;
    readonly purpose: string;
}

export abstract class SecretSealerPort {
    public abstract readonly driver: SecretSealerDriverName;
    public abstract seal(plain: string, context: SealContext): Promise<string>;
    public abstract open(sealed: string, context: SealContext): Promise<string>;
}
