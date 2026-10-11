export interface SealedRecord {
    readonly id: string;
    readonly sealed: string;
}

export abstract class ResealableSecretsPort {
    public abstract readonly purpose: string;
    public abstract listCompanyIds(): Promise<string[]>;
    public abstract listSealed(companyId: string): Promise<SealedRecord[]>;
    public abstract replaceSealed(companyId: string, id: string, sealed: string): Promise<void>;
}
